'use client';

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { formatUnits } from 'viem';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useConditions } from '~/hooks/graphql/useConditions';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { useAuctionRelayerFeed } from '~/lib/auction/useAuctionRelayerFeed';
import { useRestrictedJurisdiction } from '~/hooks/useRestrictedJurisdiction';
import type { MultiSelectItem } from '~/components/terminal/filters/MultiSelect';

import type { AutoBidProps, Order, OrderDraft } from './types';
import { DEFAULT_CONDITION_ODDS } from './constants';
import {
  formatTimeRemaining,
  formatOrderTag,
  formatOrderLabelSnapshot,
} from './utils';
import { useAutoBidLogs } from './hooks/useAutoBidLogs';
import { useAutoBidOrders } from './hooks/useAutoBidOrders';
import { useAuctionMatching } from './hooks/useAuctionMatching';
import AutoBidHeader from './components/AutoBidHeader';
import OrdersList from './components/OrdersList';
import LogsPanel from './components/LogsPanel';
import OrderBuilderDialog from './components/OrderBuilderDialog';

const AutoBid: React.FC<AutoBidProps> = ({ onApplyFilter }) => {
  const { address } = useAccount();
  const chainId = useChainIdFromLocalStorage();
  const { messages: auctionMessages } = useAuctionRelayerFeed();
  const { isRestricted, isPermitLoading } = useRestrictedJurisdiction();

  const {
    balance,
    symbol: collateralSymbol,
    decimals: tokenDecimals,
  } = useCollateralBalance({
    address,
    chainId,
    enabled: Boolean(address),
  });

  const COLLATERAL_ADDRESS = DEFAULT_COLLATERAL_ASSET as
    | `0x${string}`
    | undefined;
  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  const { openApproval } = useApprovalDialog();
  const [spenderAddressInput] = useState<string>(
    (SPENDER_ADDRESS as string | undefined) ?? ''
  );

  // Dialog state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [initialDraft, setInitialDraft] = useState<OrderDraft>({
    durationValue: '',
    strategy: 'conditions',
    copyTradeAddress: '',
    increment: '1',
    conditionSelections: [],
    odds: DEFAULT_CONDITION_ODDS,
  });

  const { data: conditionCatalog = [] } = useConditions({
    take: 200,
    chainId: chainId || undefined,
  });

  const activeConditionCatalog = useMemo(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return (conditionCatalog || []).filter((condition) => {
      if (typeof condition?.endTime !== 'number') return false;
      return condition.endTime > nowSeconds;
    });
  }, [conditionCatalog]);

  const balanceDisplay = useMemo(() => {
    return formatFiveSigFigs(balance);
  }, [balance]);

  const { allowance } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: (spenderAddressInput || SPENDER_ADDRESS) as
      | `0x${string}`
      | undefined,
    amount: '',
    chainId: chainId,
    decimals: tokenDecimals,
    enabled: Boolean(
      COLLATERAL_ADDRESS && (spenderAddressInput || SPENDER_ADDRESS)
    ),
  });

  const allowanceValue = useMemo(() => {
    try {
      if (allowance == null) return 0;
      return Number(formatUnits(allowance as unknown as bigint, tokenDecimals));
    } catch {
      return 0;
    }
  }, [allowance, tokenDecimals]);

  const allowanceDisplay = useMemo(() => {
    try {
      return formatFiveSigFigs(allowanceValue);
    } catch {
      return '0';
    }
  }, [allowanceValue]);

  const formatCollateralAmount = useCallback(
    (value?: string | null) => {
      if (!value) {
        return null;
      }
      try {
        const human = Number(formatUnits(BigInt(value), tokenDecimals));
        return formatFiveSigFigs(human);
      } catch {
        return null;
      }
    },
    [tokenDecimals]
  );

  // Logs hook
  const { logs, pushLogEntry } = useAutoBidLogs();

  // Log order event callback
  const logOrderEvent = useCallback(
    (
      order: Order,
      action: 'created' | 'updated' | 'deleted' | 'paused' | 'resumed',
      position?: number
    ) => {
      const actionLabels: Record<typeof action, string> = {
        created: 'Created',
        updated: 'Updated',
        deleted: 'Cancelled',
        paused: 'Paused',
        resumed: 'Resumed',
      };
      const tag = formatOrderTag(
        order,
        position,
        (o) => orderIndexMap.get(o.id) ?? 0
      );
      pushLogEntry({
        kind: 'order',
        message: `${tag} ${actionLabels[action].toLowerCase()}`,
        meta: {
          orderId: order.id,
          labelSnapshot: formatOrderLabelSnapshot(tag, order),
          action,
          strategy: order.strategy,
        },
      });
    },
    [pushLogEntry]
  );

  // Orders hook
  const {
    orders,
    setOrders,
    sortedOrders,
    orderIndexMap,
    getOrderIndex,
    orderLabelById,
    now,
    handleDelete,
    toggleOrderStatus,
    createDraftFromOrder,
  } = useAutoBidOrders(logOrderEvent);

  // Auction matching hook
  useAuctionMatching({
    orders,
    getOrderIndex,
    pushLogEntry,
    allowanceValue,
    isPermitLoading,
    isRestricted,
    address,
    collateralSymbol,
    tokenDecimals,
    auctionMessages,
    formatCollateralAmount,
  });

  const conditionItems = useMemo<MultiSelectItem[]>(() => {
    return activeConditionCatalog.map((condition) => ({
      value: condition.id,
      label:
        (condition.shortName as string | undefined) ||
        (condition.question as string | undefined) ||
        condition.id,
    }));
  }, [activeConditionCatalog]);

  const conditionLabelById = useMemo<Record<string, string>>(() => {
    return Object.fromEntries(
      (conditionCatalog || []).map((condition) => [
        condition.id,
        (condition.shortName as string | undefined) ||
          (condition.question as string | undefined) ||
          condition.id,
      ])
    );
  }, [conditionCatalog]);

  const conditionCategoryMap = useMemo<Record<string, string | null>>(() => {
    return Object.fromEntries(
      (conditionCatalog || []).map((condition) => [
        condition.id,
        condition?.category?.slug ?? null,
      ])
    );
  }, [conditionCatalog]);

  const describeAutoPauseStatus = useCallback(
    (order: Order) => {
      if (!order.expiration) {
        return 'No expiration set';
      }
      const expiresAt = new Date(order.expiration).getTime();
      if (!Number.isFinite(expiresAt)) {
        return 'No expiration set';
      }
      const remainingMs = expiresAt - now;
      if (remainingMs <= 0) {
        return 'Auto-pausing...';
      }
      return `${formatTimeRemaining(remainingMs)} until auto-pause`;
    },
    [now]
  );

  const applyOrderFilters = useCallback(
    (order: Order) => {
      if (!onApplyFilter) {
        return;
      }
      const ids = Array.from(
        new Set(
          (order.conditionSelections ?? [])
            .map((selection) => selection?.id)
            .filter(
              (id): id is string => typeof id === 'string' && id.length > 0
            )
        )
      );
      if (ids.length === 0) {
        return;
      }
      onApplyFilter(ids);
    },
    [onApplyFilter]
  );

  const handleEdit = useCallback(
    (order: Order) => {
      const draft = createDraftFromOrder(order);
      setInitialDraft(draft);
      setEditingId(order.id);
      setIsBuilderOpen(true);
    },
    [createDraftFromOrder]
  );

  const handleCreateOrder = useCallback(() => {
    setInitialDraft({
      durationValue: '',
      strategy: 'conditions',
      copyTradeAddress: '',
      increment: '1',
      conditionSelections: [],
      odds: DEFAULT_CONDITION_ODDS,
    });
    setEditingId(null);
    setIsBuilderOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setIsBuilderOpen(open);
    if (!open) {
      setEditingId(null);
    }
  }, []);

  const handleOrderSubmit = useCallback(
    (order: Order) => {
      const existingOrder = editingId
        ? orders.find((o) => o.id === editingId)
        : undefined;
      const position =
        editingId && existingOrder
          ? getOrderIndex(existingOrder)
          : sortedOrders.length;

      setOrders((prev) =>
        editingId
          ? prev.map((o) => (o.id === editingId ? order : o))
          : [...prev, order]
      );

      logOrderEvent(order, editingId ? 'updated' : 'created', position);
    },
    [
      editingId,
      getOrderIndex,
      logOrderEvent,
      orders,
      setOrders,
      sortedOrders.length,
    ]
  );

  const handleOrderDelete = useCallback(
    (id: string) => {
      handleDelete(id);
    },
    [handleDelete]
  );

  return (
    <div className="border border-border/60 rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0 overflow-hidden">
      <div className="pl-4 pr-3 h-[57px] border-b border-border/60 bg-muted/10 flex items-center">
        <div className="flex items-center justify-between w-full">
          <div className="eyebrow text-foreground">Auto-Bid</div>
          <span className="font-mono text-[10px] leading-none text-accent-gold tracking-[0.18em] inline-flex items-center">
            EXPERIMENTAL
          </span>
        </div>
      </div>
      <div className="pl-3 pr-4 py-4 sm:pl-4 flex-1 min-h-0 flex flex-col">
        <AutoBidHeader
          allowanceDisplay={allowanceDisplay}
          balanceDisplay={balanceDisplay}
          collateralSymbol={collateralSymbol}
          onOpenApproval={openApproval}
        />

        <div className="flex flex-col flex-1 min-h-0 gap-2">
          <OrdersList
            orders={orders}
            sortedOrders={sortedOrders}
            collateralSymbol={collateralSymbol}
            conditionLabelById={conditionLabelById}
            conditionCategoryMap={conditionCategoryMap}
            describeAutoPauseStatus={describeAutoPauseStatus}
            onToggleStatus={toggleOrderStatus}
            onEdit={handleEdit}
            onApplyFilter={onApplyFilter ? applyOrderFilters : undefined}
            onCreateOrder={handleCreateOrder}
            showFilterButton={Boolean(onApplyFilter)}
          />

          <LogsPanel logs={logs} orderLabelById={orderLabelById} />
        </div>
      </div>

      <OrderBuilderDialog
        open={isBuilderOpen}
        onOpenChange={handleDialogOpenChange}
        editingId={editingId}
        initialDraft={initialDraft}
        orders={orders}
        sortedOrders={sortedOrders}
        collateralSymbol={collateralSymbol}
        conditionItems={conditionItems}
        conditionLabelById={conditionLabelById}
        conditionCategoryMap={conditionCategoryMap}
        getOrderIndex={getOrderIndex}
        onSubmit={handleOrderSubmit}
        onDelete={handleOrderDelete}
      />
    </div>
  );
};

export default AutoBid;
