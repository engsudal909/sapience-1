'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { Clock, Info, Pause, Pencil, Play, X } from 'lucide-react';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Label } from '@sapience/sdk/ui/components/ui/label';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import { predictionMarket } from '@sapience/sdk/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { useConditions } from '~/hooks/graphql/useConditions';
import ConditionsFilter from '~/components/terminal/filters/ConditionsFilter';
import type { MultiSelectItem } from '~/components/terminal/filters/MultiSelect';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
// removed dialog imports
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatPercentChance } from '~/lib/format/percentChance';
import { cn, formatFiveSigFigs } from '~/lib/utils/util';
import { useApprovalDialog } from '~/components/terminal/ApprovalDialogContext';
import { COLLATERAL_SYMBOLS } from '@sapience/sdk/constants';
import ForecastOddsSlider from '~/components/shared/ForecastOddsSlider';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';

type OrderStrategy = 'copy_trade' | 'conditions';
type ConditionOutcome = 'yes' | 'no';

type ConditionSelection = {
  id: string;
  outcome: ConditionOutcome;
};

type OrderStatus = 'active' | 'paused';

type Order = {
  id: string;
  expiration: string | null;
  autoPausedAt: string | null;
  strategy: OrderStrategy;
  copyTradeAddress?: string;
  increment?: number;
  conditionSelections?: ConditionSelection[];
  odds: number;
  status: OrderStatus;
};

type OrderDraft = {
  durationValue: string;
  strategy: OrderStrategy;
  copyTradeAddress: string;
  increment: string;
  conditionSelections: ConditionSelection[];
  odds: number;
};

const AUTO_BID_STORAGE_KEY = 'sapience:autoBidOrders';

const sanitizeConditionSelections = (
  value: unknown
): ConditionSelection[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const selections = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const id =
        typeof (item as ConditionSelection).id === 'string'
          ? (item as ConditionSelection).id
          : null;
      const outcome =
        (item as ConditionSelection).outcome === 'yes' ||
        (item as ConditionSelection).outcome === 'no'
          ? (item as ConditionSelection).outcome
          : null;
      if (!id || !outcome) {
        return null;
      }
      return { id, outcome };
    })
    .filter((entry): entry is ConditionSelection => Boolean(entry));
  return selections.length > 0 ? selections : undefined;
};

const sanitizeOrder = (value: unknown): Order | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<Order>;
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }
  if (typeof candidate.odds !== 'number' || !Number.isFinite(candidate.odds)) {
    return null;
  }
  const strategy: OrderStrategy | null =
    candidate.strategy === 'copy_trade'
      ? 'copy_trade'
      : candidate.strategy === 'conditions'
        ? 'conditions'
        : null;
  if (!strategy) {
    return null;
  }

  const expiration =
    typeof candidate.expiration === 'string' ? candidate.expiration : null;
  const autoPausedAt =
    typeof candidate.autoPausedAt === 'string' ? candidate.autoPausedAt : null;

  const baseOrder: Order = {
    id: candidate.id,
    expiration,
    autoPausedAt,
    strategy,
    odds: clampConditionOdds(candidate.odds),
    status:
      candidate.status === 'paused' || candidate.status === 'active'
        ? candidate.status
        : 'active',
  };

  if (strategy === 'copy_trade') {
    baseOrder.copyTradeAddress =
      typeof candidate.copyTradeAddress === 'string'
        ? candidate.copyTradeAddress
        : undefined;
    baseOrder.increment =
      typeof candidate.increment === 'number' &&
      Number.isFinite(candidate.increment)
        ? candidate.increment
        : undefined;
  } else if (strategy === 'conditions') {
    baseOrder.conditionSelections = sanitizeConditionSelections(
      candidate.conditionSelections
    );
  }

  return baseOrder;
};

const readOrdersFromStorage = (): Order[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(AUTO_BID_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => sanitizeOrder(entry))
      .filter((order): order is Order => Boolean(order));
  } catch {
    return [];
  }
};

const writeOrdersToStorage = (orders: Order[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      AUTO_BID_STORAGE_KEY,
      JSON.stringify(orders ?? [])
    );
  } catch {
    // no-op
  }
};

const HOUR_IN_MS = 60 * 60 * 1000;
const DEFAULT_DURATION_HOURS = '24';
const DEFAULT_CONDITION_ODDS = 50;
const EXAMPLE_ODDS_STAKE = 100;
const AUTO_PAUSE_TICK_MS = 1000;
const YES_BADGE_BASE_CLASSES =
  'border-green-500/40 bg-green-500/10 text-green-600';
const YES_BADGE_HOVER_CLASSES =
  'hover:border-green-500/60 hover:bg-green-500/15 hover:text-green-600/90';
const YES_BADGE_SHADOW = 'shadow-[0_0_0_1px_rgba(34,197,94,0.35)]';
const NO_BADGE_BASE_CLASSES = 'border-red-500/40 bg-red-500/10 text-red-600';
const NO_BADGE_HOVER_CLASSES =
  'hover:border-red-500/60 hover:bg-red-500/15 hover:text-red-600/90';
const NO_BADGE_SHADOW = 'shadow-[0_0_0_1px_rgba(239,68,68,0.35)]';

const withAlpha = (color: string, alpha: number): string => {
  const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
  if (hexMatch.test(color)) {
    const a = Math.max(0, Math.min(1, alpha));
    const aHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, '0');
    return `${color}${aHex}`;
  }
  const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
    `${fn}(${inside} / ${alpha})`;
  if (color.startsWith('hsl(')) return toSlashAlpha('hsl', color.slice(4, -1));
  if (color.startsWith('rgb(')) return toSlashAlpha('rgb', color.slice(4, -1));
  return color;
};

const clampConditionOdds = (value: number | null | undefined) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_CONDITION_ODDS;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const formatDurationValue = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  const fixed = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

const formatTimeRemaining = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0s';
  const totalSeconds = Math.floor(value / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
};

const deriveDurationValueFromExpiration = (
  expiration?: string | null
): string => {
  if (!expiration) {
    return '';
  }
  const expiresAt = new Date(expiration).getTime();
  if (!Number.isFinite(expiresAt)) {
    return '';
  }
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return '';
  }
  const value = remainingMs / HOUR_IN_MS;
  return formatDurationValue(value);
};

const createEmptyDraft = (): OrderDraft => ({
  durationValue: '',
  strategy: 'conditions',
  copyTradeAddress: '',
  increment: '1',
  conditionSelections: [],
  odds: DEFAULT_CONDITION_ODDS,
});

const AutoBid: React.FC = () => {
  const { address } = useAccount();
  const chainId = useChainIdFromLocalStorage();
  const collateralSymbol = COLLATERAL_SYMBOLS[chainId] || 'testUSDe';

  const COLLATERAL_ADDRESS = DEFAULT_COLLATERAL_ASSET as
    | `0x${string}`
    | undefined;
  const SPENDER_ADDRESS = predictionMarket[chainId]?.address as
    | `0x${string}`
    | undefined;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: chainId,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  const { data: rawBalance } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId,
    query: { enabled: Boolean(address && COLLATERAL_ADDRESS) },
  });

  // removed balance dialog state
  const { openApproval } = useApprovalDialog();
  const [spenderAddressInput] = useState<string>(
    (SPENDER_ADDRESS as string | undefined) ?? ''
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const hasHydratedOrdersRef = useRef(false);
  const [draft, setDraft] = useState<OrderDraft>(() => createEmptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [isDurationExpanded, setIsDurationExpanded] = useState(false);
  const [isPayoutPopoverOpen, setIsPayoutPopoverOpen] = useState(false);
  const [examplePayoutInput, setExamplePayoutInput] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const isExamplePayoutInputValid = useMemo(() => {
    const parsed = Number(examplePayoutInput);
    return Number.isFinite(parsed) && parsed >= 100;
  }, [examplePayoutInput]);

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

  useEffect(() => {
    const storedOrders = readOrdersFromStorage();
    if (storedOrders.length > 0) {
      setOrders(storedOrders);
    }
    hasHydratedOrdersRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedOrdersRef.current) {
      return;
    }
    writeOrdersToStorage(orders);
  }, [orders]);

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
  const examplePayout = useMemo(() => {
    const odds = clampConditionOdds(draft.odds);
    if (odds <= 0) return null;
    return (EXAMPLE_ODDS_STAKE * 100) / odds;
  }, [draft.odds]);

  useEffect(() => {
    if (isPayoutPopoverOpen) {
      const fallback = 100;
      const normalized =
        examplePayout == null || !Number.isFinite(examplePayout)
          ? fallback
          : Math.max(examplePayout, fallback);
      setExamplePayoutInput(normalized.toFixed(2));
    }
  }, [isPayoutPopoverOpen, examplePayout]);

  const conditionCategoryMap = useMemo<Record<string, string | null>>(() => {
    return Object.fromEntries(
      (conditionCatalog || []).map((condition) => [
        condition.id,
        condition?.category?.slug ?? null,
      ])
    );
  }, [conditionCatalog]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, AUTO_PAUSE_TICK_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (orders.length === 0) {
      return;
    }
    let mutated = false;
    const updated = orders.map((order) => {
      if (order.status === 'active' && order.expiration) {
        const expiresAt = new Date(order.expiration).getTime();
        if (Number.isFinite(expiresAt) && expiresAt <= now) {
          mutated = true;
          return {
            ...order,
            status: 'paused' as OrderStatus,
            expiration: null,
            autoPausedAt: new Date(now).toISOString(),
          };
        }
      }
      return order;
    });
    if (mutated) {
      setOrders(updated);
    }
  }, [orders, now]);

  const tokenDecimals = useMemo(() => {
    try {
      return typeof decimals === 'number' ? decimals : Number(decimals ?? 18);
    } catch {
      return 18;
    }
  }, [decimals]);

  const balanceDisplay = useMemo(() => {
    try {
      if (!rawBalance) return '0';
      const human = Number(
        formatUnits(rawBalance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [rawBalance, tokenDecimals]);

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

  const parsedIncrement = useMemo(() => {
    const next = Number(draft.increment);
    return Number.isFinite(next) ? next : NaN;
  }, [draft.increment]);

  const parsedDurationMs = useMemo(() => {
    const raw = draft.durationValue.trim();
    if (raw.length === 0) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return numeric * HOUR_IN_MS;
  }, [draft.durationValue]);

  const hasDurationValue = draft.durationValue.trim().length > 0;
  const showDurationFields = isDurationExpanded || hasDurationValue;

  const trimmedCopyTradeAddress = draft.copyTradeAddress.trim();

  const isCopyTradeValid =
    draft.strategy !== 'copy_trade' ||
    (trimmedCopyTradeAddress.length > 0 &&
      isAddress(trimmedCopyTradeAddress as `0x${string}`) &&
      Number.isFinite(parsedIncrement) &&
      parsedIncrement > 0);

  const isConditionsValid =
    draft.strategy !== 'conditions' || draft.conditionSelections.length > 0;

  const isDurationValid = parsedDurationMs !== undefined;

  const isFormValid = isDurationValid && isCopyTradeValid && isConditionsValid;

  type DraftUpdater = Partial<OrderDraft> | ((prev: OrderDraft) => OrderDraft);

  const updateDraft = (updates: DraftUpdater) => {
    setDraft((prev) => {
      if (typeof updates === 'function') {
        return updates(prev);
      }
      return { ...prev, ...updates };
    });
    setFormError(null);
  };

  const enableDurationFields = () => {
    setIsDurationExpanded(true);
    updateDraft((prev) => {
      if (prev.durationValue.trim().length > 0) {
        return prev;
      }
      return { ...prev, durationValue: DEFAULT_DURATION_HOURS };
    });
  };

  const clearDurationFields = () => {
    setIsDurationExpanded(false);
    updateDraft({
      durationValue: '',
    });
  };

  const handleConditionPickerChange = (values: string[]) => {
    updateDraft((prev) => ({
      ...prev,
      conditionSelections: values.map((value) => {
        const existing = prev.conditionSelections.find(
          (selection) => selection.id === value
        );
        if (existing) {
          return { ...existing };
        }
        return {
          id: value,
          outcome: 'yes',
        };
      }),
    }));
  };

  const handleConditionOutcomeChange = (
    conditionId: string,
    outcome: ConditionOutcome
  ) => {
    updateDraft((prev) => {
      let nextOdds = prev.odds;
      const nextSelections = prev.conditionSelections.map((selection) => {
        if (selection.id !== conditionId) {
          return selection;
        }
        if (
          prev.conditionSelections.length === 1 &&
          selection.outcome !== outcome
        ) {
          nextOdds = clampConditionOdds(100 - prev.odds);
        }
        return { ...selection, outcome };
      });
      return {
        ...prev,
        conditionSelections: nextSelections,
        odds: nextOdds,
      };
    });
  };

  const handleOrderOddsChange = (odds: number) => {
    updateDraft({ odds: clampConditionOdds(odds) });
  };

  const applyExamplePayoutInput = () => {
    const parsed = Number(examplePayoutInput);
    if (!Number.isFinite(parsed) || parsed < 100) {
      return;
    }
    const nextOdds = Math.round((EXAMPLE_ODDS_STAKE * 100) / parsed);
    handleOrderOddsChange(clampConditionOdds(nextOdds));
    setIsPayoutPopoverOpen(false);
  };

  const handleConditionRemove = (conditionId: string) => {
    updateDraft((prev) => ({
      ...prev,
      conditionSelections: prev.conditionSelections.filter(
        (selection) => selection.id !== conditionId
      ),
    }));
  };

  const resetDraft = () => {
    setDraft(createEmptyDraft());
    setEditingId(null);
    setFormError(null);
    setIsDurationExpanded(false);
  };

  const handleBuilderOpenChange = (open: boolean) => {
    setIsBuilderOpen(open);
    if (!open) {
      resetDraft();
    }
  };

  const handleEdit = (order: Order) => {
    const derivedDurationValue = deriveDurationValueFromExpiration(
      order.expiration
    );
    setDraft({
      durationValue: derivedDurationValue,
      strategy: order.strategy,
      copyTradeAddress: order.copyTradeAddress ?? '',
      increment: order.increment != null ? order.increment.toString() : '1',
      conditionSelections: (order.conditionSelections ?? []).map(
        (selection) => ({
          id: selection.id,
          outcome: selection.outcome,
        })
      ),
      odds: clampConditionOdds(order.odds ?? DEFAULT_CONDITION_ODDS),
    });
    setEditingId(order.id);
    setFormError(null);
    setIsBuilderOpen(true);
    setIsDurationExpanded(Boolean(derivedDurationValue));
  };

  const handleDelete = (id: string) => {
    setOrders((prev) => prev.filter((order) => order.id !== id));
    if (editingId === id) {
      resetDraft();
      setIsBuilderOpen(false);
    }
  };

  const toggleOrderStatus = (id: string) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== id) {
          return order;
        }
        const nextStatus = order.status === 'active' ? 'paused' : 'active';
        return {
          ...order,
          status: nextStatus,
          autoPausedAt: nextStatus === 'active' ? null : order.autoPausedAt,
        };
      })
    );
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (parsedDurationMs === undefined) {
      setFormError('Duration must be greater than zero.');
      return;
    }

    if (draft.strategy === 'copy_trade') {
      if (trimmedCopyTradeAddress.length === 0) {
        setFormError('Enter the address you want to copy.');
        return;
      }
      if (!isAddress(trimmedCopyTradeAddress as `0x${string}`)) {
        setFormError('Enter a valid Ethereum address.');
        return;
      }
      if (!Number.isFinite(parsedIncrement) || parsedIncrement <= 0) {
        setFormError('Increment must be greater than zero.');
        return;
      }
    }

    if (
      draft.strategy === 'conditions' &&
      draft.conditionSelections.length === 0
    ) {
      setFormError('Select at least one prediction.');
      return;
    }

    if (!isFormValid) {
      setFormError('Please complete the form.');
      return;
    }

    const expirationTimestamp =
      typeof parsedDurationMs === 'number'
        ? new Date(Date.now() + parsedDurationMs).toISOString()
        : null;

    const existingOrder = editingId
      ? orders.find((order) => order.id === editingId)
      : undefined;

    const nextOrder: Order = {
      id:
        editingId ??
        `order-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      expiration: expirationTimestamp,
      autoPausedAt:
        typeof parsedDurationMs === 'number'
          ? null
          : (existingOrder?.autoPausedAt ?? null),
      strategy: draft.strategy,
      copyTradeAddress:
        draft.strategy === 'copy_trade' ? trimmedCopyTradeAddress : undefined,
      increment: draft.strategy === 'copy_trade' ? parsedIncrement : undefined,
      conditionSelections:
        draft.strategy === 'conditions' ? draft.conditionSelections : undefined,
      odds: clampConditionOdds(draft.odds),
      status: editingId
        ? (orders.find((order) => order.id === editingId)?.status ?? 'active')
        : 'active',
    };

    setOrders((prev) =>
      editingId
        ? prev.map((order) => (order.id === editingId ? nextOrder : order))
        : [...prev, nextOrder]
    );

    setIsBuilderOpen(false);
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aTime = a.expiration
        ? new Date(a.expiration).getTime()
        : Number.POSITIVE_INFINITY;
      const bTime = b.expiration
        ? new Date(b.expiration).getTime()
        : Number.POSITIVE_INFINITY;
      const safeATime = Number.isFinite(aTime)
        ? aTime
        : Number.POSITIVE_INFINITY;
      const safeBTime = Number.isFinite(bTime)
        ? bTime
        : Number.POSITIVE_INFINITY;
      return safeATime - safeBTime;
    });
  }, [orders]);

  const strategyLabels: Record<OrderStrategy, string> = {
    conditions: 'Limit Order',
    copy_trade: 'Copy Trade',
  };
  const strategyBadgeLabels: Record<OrderStrategy, string> = {
    conditions: 'LIMIT',
    copy_trade: 'COPY',
  };

  const describeConditionTargeting = (selections?: ConditionSelection[]) => {
    if (!selections || selections.length === 0) return 'All questions';
    const yesCount = selections.filter(
      (selection) => selection.outcome === 'yes'
    ).length;
    const noCount = selections.length - yesCount;
    if (noCount === 0) {
      return `${yesCount} predicting Yes`;
    }
    if (yesCount === 0) {
      return `${noCount} predicting No`;
    }
    return `${yesCount} Yes · ${noCount} No`;
  };

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

  // Approval dialog is controlled via context; no event listeners needed

  // removed balance dialog URLs

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
        <div>
          <div className="grid grid-cols-2 gap-2">
            {/* Left: Approved Spend */}
            <div className="px-1">
              <div className="text-xs font-medium text-muted-foreground">
                Approved Spend
              </div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {allowanceDisplay} {collateralSymbol}
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  aria-label="Edit approved spend"
                  onClick={() => openApproval()}
                >
                  <Pencil className="h-3 w-3 text-accent-gold" />
                </button>
              </div>
            </div>

            {/* Right: Account Balance */}
            <div className="px-1">
              <div className="text-xs font-medium text-muted-foreground">
                Account Balance
              </div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {balanceDisplay} {collateralSymbol}
              </div>
            </div>
          </div>
        </div>

        <div className="px-1">
          <section className="rounded-md py-4 flex-1 min-h-0 flex flex-col bg-muted/5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Orders
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-gold underline decoration-dotted decoration-accent-gold/70 underline-offset-4 transition-colors hover:text-accent-gold/80"
                  onClick={() => {
                    resetDraft();
                    setIsBuilderOpen(true);
                  }}
                >
                  Create Order
                </button>
              </div>
            </div>
            <div className="mt-2 flex-1 min-h-0 overflow-y-auto">
              {orders.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                  Create an order to see it here.
                </div>
              ) : (
                <ul className="space-y-3">
                  {sortedOrders.map((order) => {
                    const isActive = order.status === 'active';
                    return (
                      <li
                        key={order.id}
                        className="rounded-md border border-border/60 bg-background p-3"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1 w-full">
                            <div className="flex w-full items-start gap-2 mb-1.5">
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleOrderStatus(order.id)}
                                  className={cn(
                                    'group/order-toggle relative inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                    order.status === 'active'
                                      ? cn(
                                          YES_BADGE_BASE_CLASSES,
                                          YES_BADGE_HOVER_CLASSES,
                                          YES_BADGE_SHADOW
                                        )
                                      : cn(
                                          'border-border/40 bg-transparent text-muted-foreground/70',
                                          YES_BADGE_HOVER_CLASSES
                                        )
                                  )}
                                  aria-label={
                                    order.status === 'active'
                                      ? 'Pause order'
                                      : 'Resume order'
                                  }
                                >
                                  <Play
                                    className={cn(
                                      'h-2.5 w-2.5 transition-all duration-200',
                                      isActive
                                        ? 'text-green-600 opacity-95 group-hover/order-toggle:text-muted-foreground/80 group-hover/order-toggle:opacity-0'
                                        : 'text-green-600 opacity-0 group-hover/order-toggle:opacity-100'
                                    )}
                                    aria-hidden
                                  />
                                  <Pause
                                    className={cn(
                                      'absolute h-2.5 w-2.5 transition-all duration-200',
                                      isActive
                                        ? 'text-muted-foreground opacity-0 group-hover/order-toggle:text-muted-foreground group-hover/order-toggle:opacity-100'
                                        : 'text-muted-foreground/90 opacity-100 group-hover/order-toggle:text-green-600 group-hover/order-toggle:opacity-0'
                                    )}
                                    aria-hidden
                                  />
                                </button>
                                <Badge
                                  variant="secondary"
                                  className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] h-6 px-3 inline-flex items-center rounded-full border border-border/60"
                                >
                                  {strategyBadgeLabels[order.strategy]}
                                </Badge>
                                <span className="text-sm font-mono font-medium text-brand-white">
                                  {order.strategy === 'copy_trade'
                                    ? `+${formatFiveSigFigs(
                                        order.increment ?? 0
                                      )} ${collateralSymbol}`
                                    : `${formatPercentChance(order.odds / 100)} odds`}
                                </span>
                              </div>
                              <div className="ml-auto flex items-center justify-end self-start">
                                <button
                                  type="button"
                                  onClick={() => handleEdit(order)}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-transparent text-muted-foreground transition-colors hover:border-border hover:text-brand-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                  aria-label="Edit order"
                                >
                                  <Pencil className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            </div>
                            {order.strategy === 'copy_trade' ? (
                              <>
                                {order.copyTradeAddress ? (
                                  <div className="flex items-center gap-2 py-1.5">
                                    <EnsAvatar
                                      address={order.copyTradeAddress}
                                      width={16}
                                      height={16}
                                      rounded={false}
                                      className="rounded-[3px]"
                                    />
                                    <AddressDisplay
                                      address={order.copyTradeAddress}
                                      compact
                                      className="text-brand-white [&_.font-mono]:text-brand-white"
                                    />
                                  </div>
                                ) : null}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" aria-hidden />
                                  <span>{describeAutoPauseStatus(order)}</span>
                                </div>
                              </>
                            ) : (
                              <>
                                {order.conditionSelections &&
                                order.conditionSelections.length > 0 ? (
                                  <div className="space-y-1 py-1.5">
                                    {order.conditionSelections.map(
                                      (selection) => {
                                        const categorySlug =
                                          conditionCategoryMap[selection.id] ??
                                          undefined;
                                        const Icon =
                                          getCategoryIcon(categorySlug);
                                        const color =
                                          getCategoryStyle(categorySlug)?.color;
                                        const label =
                                          conditionLabelById[selection.id] ??
                                          selection.id;
                                        return (
                                          <div
                                            key={selection.id}
                                            className="flex w-full items-center gap-2 text-xs"
                                          >
                                            <span
                                              className="inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0"
                                              style={{
                                                backgroundColor: withAlpha(
                                                  color || 'hsl(var(--muted))',
                                                  0.14
                                                ),
                                              }}
                                            >
                                              <Icon
                                                className="h-3 w-3"
                                                style={{
                                                  color: color || 'inherit',
                                                  strokeWidth: 1,
                                                }}
                                              />
                                            </span>
                                            <span className="font-mono text-xs text-brand-white leading-tight flex-1 min-w-0 break-words">
                                              {label}
                                            </span>
                                            <span
                                              className={cn(
                                                'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-mono font-medium border',
                                                selection.outcome === 'yes'
                                                  ? YES_BADGE_BASE_CLASSES
                                                  : NO_BADGE_BASE_CLASSES
                                              )}
                                            >
                                              {selection.outcome === 'yes'
                                                ? 'Yes'
                                                : 'No'}
                                            </span>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                ) : (
                                  <p className="py-1.5 text-xs text-muted-foreground">
                                    {describeConditionTargeting(
                                      order.conditionSelections
                                    )}
                                  </p>
                                )}
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" aria-hidden />
                                  <span>{describeAutoPauseStatus(order)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={isBuilderOpen} onOpenChange={handleBuilderOpenChange}>
        <DialogContent className="border border-border/60 bg-brand-black text-brand-white sm:max-w-lg w-full">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Order' : 'Create Order'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Orders only execute while this app is running.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Label>Strategy</Label>
              <div className="inline-flex w-full gap-1 rounded-md border border-border/60 bg-muted/10 p-1">
                {(Object.keys(strategyLabels) as OrderStrategy[]).map(
                  (strategy) => {
                    const isActive = draft.strategy === strategy;
                    return (
                      <Button
                        key={strategy}
                        type="button"
                        size="xs"
                        variant={isActive ? 'default' : 'ghost'}
                        className="flex-1"
                        aria-pressed={isActive}
                        onClick={() => updateDraft({ strategy })}
                      >
                        {strategyLabels[strategy]}
                      </Button>
                    );
                  }
                )}
              </div>
              {draft.strategy === 'copy_trade' ? (
                <p className="text-sm text-muted-foreground mt-1.5">
                  Automatically out-bid other accounts. You can explore the{' '}
                  <a
                    href="/leaderboard"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-white underline decoration-dotted underline-offset-2 hover:text-brand-white/80"
                  >
                    leaderboard
                  </a>{' '}
                  for accounts with recently created <em>anti-parlay</em>{' '}
                  positions.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1.5">
                  Offer odds to{' '}
                  <a
                    href="/markets"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-white underline decoration-dotted underline-offset-2 hover:text-brand-white/80"
                  >
                    prediction market
                  </a>{' '}
                  traders. These orders may be filled multiple times.
                </p>
              )}
            </div>

            {draft.strategy === 'copy_trade' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="copy-trade-address" className="text-sm">
                      Account Address
                    </Label>
                    <Input
                      id="copy-trade-address"
                      placeholder="0x..."
                      value={draft.copyTradeAddress}
                      onChange={(event) =>
                        updateDraft({ copyTradeAddress: event.target.value })
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Wallet to automatically out-bid
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="copy-trade-increment" className="text-sm">
                      Increment
                    </Label>
                    <div className="flex">
                      <Input
                        id="copy-trade-increment"
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={draft.increment}
                        onChange={(event) =>
                          updateDraft({ increment: event.target.value })
                        }
                        className="rounded-r-none border-r-0 flex-1"
                      />
                      <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-3 text-xs text-muted-foreground ml-[-1px]">
                        {collateralSymbol}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Amount to add to copied bid
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Predictions</Label>
                <ConditionsFilter
                  items={conditionItems}
                  selected={draft.conditionSelections.map(
                    (selection) => selection.id
                  )}
                  onChange={handleConditionPickerChange}
                  categoryById={conditionCategoryMap}
                  placeholder="Select question..."
                  alwaysShowPlaceholder
                  size="default"
                  matchTriggerWidth
                  closeOnSelect
                />
                {draft.conditionSelections.length > 0 ? (
                  <>
                    <Label className="mt-2 text-xs font-medium text-muted-foreground">
                      {draft.conditionSelections.length === 1
                        ? 'Selected Prediction'
                        : 'Selected Predictions'}
                    </Label>
                    <ul className="mt-1 space-y-2">
                      {draft.conditionSelections.map((selection) => {
                        const label =
                          conditionLabelById[selection.id] ?? selection.id;
                        const slug = conditionCategoryMap[selection.id] ?? null;
                        const Icon = getCategoryIcon(slug ?? undefined);
                        const color = getCategoryStyle(slug)?.color;
                        return (
                          <li
                            key={selection.id}
                            className="rounded-md border border-border/60 bg-background p-3"
                          >
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="inline-flex items-center justify-center rounded-full shrink-0"
                                    style={{
                                      width: 22,
                                      height: 22,
                                      minWidth: 22,
                                      minHeight: 22,
                                      backgroundColor: withAlpha(
                                        color || 'hsl(var(--muted))',
                                        0.14
                                      ),
                                    }}
                                  >
                                    <Icon
                                      className="h-3 w-3"
                                      style={{ strokeWidth: 1, color }}
                                    />
                                  </span>
                                  <span className="font-mono text-xs text-brand-white break-words leading-tight">
                                    {label}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                <div className="flex w-full gap-2 sm:w-auto">
                                  <button
                                    type="button"
                                    aria-pressed={selection.outcome === 'yes'}
                                    onClick={() =>
                                      handleConditionOutcomeChange(
                                        selection.id,
                                        'yes'
                                      )
                                    }
                                    className={cn(
                                      'flex-1 min-w-[42px] inline-flex items-center justify-center rounded-sm border px-2 text-[10px] font-mono leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-6',
                                      selection.outcome === 'yes'
                                        ? cn(
                                            YES_BADGE_BASE_CLASSES,
                                            YES_BADGE_HOVER_CLASSES,
                                            YES_BADGE_SHADOW
                                          )
                                        : cn(
                                            'border-border/60 text-muted-foreground',
                                            YES_BADGE_HOVER_CLASSES
                                          )
                                    )}
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={selection.outcome === 'no'}
                                    onClick={() =>
                                      handleConditionOutcomeChange(
                                        selection.id,
                                        'no'
                                      )
                                    }
                                    className={cn(
                                      'flex-1 min-w-[42px] inline-flex items-center justify-center rounded-sm border px-2 text-[10px] font-mono leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring h-6',
                                      selection.outcome === 'no'
                                        ? cn(
                                            NO_BADGE_BASE_CLASSES,
                                            NO_BADGE_HOVER_CLASSES,
                                            NO_BADGE_SHADOW
                                          )
                                        : cn(
                                            'border-border/60 text-muted-foreground',
                                            NO_BADGE_HOVER_CLASSES
                                          )
                                    )}
                                  >
                                    No
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Remove selection"
                                  onClick={() =>
                                    handleConditionRemove(selection.id)
                                  }
                                  className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground transition-opacity hover:opacity-80 self-start sm:self-auto shrink-0"
                                >
                                  <X className="h-4 w-4" />
                                  <span className="sr-only">
                                    Remove selection
                                  </span>
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {draft.conditionSelections.length > 1 ? (
                      <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <Info
                          className="mt-[1px] h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
                          aria-hidden
                        />
                        <span>
                          This will only execute if all of these predictions are
                          requested together. Consider seperate orders.
                        </span>
                      </p>
                    ) : null}
                    <ForecastOddsSlider
                      className="mt-4"
                      value={draft.odds}
                      onChange={handleOrderOddsChange}
                      label="Odds"
                      renderHeader={(safeValue) => {
                        const payout =
                          safeValue > 0
                            ? (EXAMPLE_ODDS_STAKE * 100) / safeValue
                            : null;
                        const payoutDisplay =
                          payout != null && Number.isFinite(payout)
                            ? payout.toFixed(2)
                            : '—';
                        return (
                          <div className="flex items-end justify-between gap-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[11px] font-mono uppercase tracking-tight text-muted-foreground">
                                Odds
                              </span>
                              <span className="font-mono text-sm text-brand-white leading-tight">
                                {formatPercentChance(safeValue / 100)} chance
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-[11px] font-mono uppercase tracking-tight text-muted-foreground">
                                100 USDe to win
                              </p>
                              <Popover
                                open={isPayoutPopoverOpen}
                                onOpenChange={setIsPayoutPopoverOpen}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="font-mono text-sm text-brand-white underline decoration-dotted decoration-brand-white underline-offset-2 hover:text-brand-white/80 hover:decoration-brand-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
                                  >
                                    {payoutDisplay} USDe
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="end"
                                  className="w-64 p-3 space-y-2"
                                >
                                  <div className="space-y-2">
                                    <Label className="text-xs">
                                      Example <em>To Win</em> Amount
                                    </Label>
                                    <Input
                                      type="number"
                                      min={100}
                                      value={examplePayoutInput}
                                      onChange={(event) =>
                                        setExamplePayoutInput(
                                          event.target.value.trim()
                                        )
                                      }
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          applyExamplePayoutInput();
                                        }
                                      }}
                                      placeholder="0.00"
                                      inputMode="decimal"
                                      className="h-8 text-sm"
                                    />
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="w-full"
                                      disabled={!isExamplePayoutInputValid}
                                      onClick={applyExamplePayoutInput}
                                    >
                                      Update Odds
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </>
                ) : null}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {showDurationFields ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="order-duration" className="text-sm">
                      Time until auto-pause
                    </Label>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex">
                      <Input
                        id="order-duration"
                        type="number"
                        min="0"
                        step="0.1"
                        inputMode="decimal"
                        placeholder="24"
                        value={draft.durationValue}
                        onChange={(event) =>
                          updateDraft({ durationValue: event.target.value })
                        }
                        className="rounded-r-none border-r-0 flex-1"
                      />
                      <div className="inline-flex items-center rounded-md rounded-l-none border border-input border-l-0 bg-muted/40 px-3 text-xs tracking-wide text-muted-foreground ml-[-1px]">
                        hours
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <button
                        type="button"
                        onClick={clearDurationFields}
                        className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                      >
                        Remove Expiration
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex w-full items-center justify-between">
                  <button
                    type="button"
                    onClick={enableDurationFields}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-white underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-80"
                  >
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Set Expiration
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingId)}
                      className="text-[11px] font-mono uppercase tracking-[0.2em] text-rose-400 underline decoration-dotted underline-offset-4 transition-colors hover:text-rose-400/80"
                    >
                      Cancel Order
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {formError ? (
              <p className="text-xs text-destructive" role="alert">
                {formError}
              </p>
            ) : null}

            <DialogFooter className="flex flex-col gap-2">
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={!isFormValid}
              >
                {editingId ? 'Update Order' : 'Add Order'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* removed balance dialog */}

      {/* Approved spend dialog is provided at page level */}
    </div>
  );
};

export default AutoBid;
