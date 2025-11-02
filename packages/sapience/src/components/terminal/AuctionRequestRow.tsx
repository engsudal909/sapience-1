'use client';

import type React from 'react';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
  decodeAbiParameters,
} from 'viem';
import { Pin, ChevronDown } from 'lucide-react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';
import { useAuctionBids } from '~/lib/auction/useAuctionBids';
import AuctionRequestInfo from '~/components/terminal/AuctionRequestInfo';
import AuctionRequestChart from '~/components/terminal/AuctionRequestChart';
import { useAccount, useSignTypedData } from 'wagmi';
import { useConnectOrCreateWallet } from '@privy-io/react-auth';
import { useSettings } from '~/lib/context/SettingsContext';
import { toAuctionWsUrl } from '~/lib/ws';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { predictionMarket } from '@sapience/sdk/contracts';
import { useToast } from '@sapience/sdk/ui/hooks/use-toast';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

type Props = {
  uiTx: UiTransaction;
  predictionsContent: React.ReactNode;
  auctionId: string | null;
  makerWager: string | null;
  maker: string | null;
  resolver: string | null;
  predictedOutcomes: string[];
  makerNonce: number | null;
  collateralAssetTicker: string;
  onTogglePin?: (auctionId: string | null) => void;
  isPinned?: boolean;
};

const AuctionRequestRow: React.FC<Props> = ({
  uiTx,
  predictionsContent,
  auctionId,
  makerWager,
  maker,
  resolver,
  predictedOutcomes,
  makerNonce,
  collateralAssetTicker,
  onTogglePin,
  isPinned,
}) => {
  const { bids } = useAuctionBids(auctionId);
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { connectOrCreateWallet } = useConnectOrCreateWallet({});
  const { apiBaseUrl } = useSettings();
  const wsUrl = useMemo(() => toAuctionWsUrl(apiBaseUrl), [apiBaseUrl]);
  const verifyingContract = predictionMarket[DEFAULT_CHAIN_ID]?.address as
    | `0x${string}`
    | undefined;
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [highlightNewBid, setHighlightNewBid] = useState(false);
  const numBids = useMemo(
    () => (Array.isArray(bids) ? bids.length : 0),
    [bids]
  );
  const bidsLabel = useMemo(
    () => (numBids === 1 ? '1 BID' : `${numBids} BIDS`),
    [numBids]
  );

  // Pulse highlight when a new bid is received
  const prevBidsRef = useRef<number>(0);
  useEffect(() => {
    const count = Array.isArray(bids) ? bids.length : 0;
    if (count > prevBidsRef.current) {
      setHighlightNewBid(true);
      // Update ref immediately so we only pulse once per new bid
      prevBidsRef.current = count;
      const t = window.setTimeout(() => setHighlightNewBid(false), 900);
      return () => window.clearTimeout(t);
    }
    prevBidsRef.current = count;
    return;
  }, [bids]);

  // Decode predicted outcomes to extract condition IDs
  const conditionIds = useMemo(() => {
    try {
      const arr = Array.isArray(predictedOutcomes)
        ? (predictedOutcomes as `0x${string}`[])
        : [];
      if (arr.length === 0) return [] as string[];
      const decodedUnknown = decodeAbiParameters(
        [
          {
            type: 'tuple[]',
            components: [
              { name: 'marketId', type: 'bytes32' },
              { name: 'prediction', type: 'bool' },
            ],
          },
        ] as const,
        arr[0]
      ) as unknown;
      const decodedArr = Array.isArray(decodedUnknown)
        ? (decodedUnknown as any)[0]
        : [];
      const ids = [] as string[];
      for (const o of decodedArr || []) {
        const id = o?.marketId as string | undefined;
        if (id && typeof id === 'string') ids.push(id);
      }
      return ids;
    } catch {
      return [] as string[];
    }
  }, [predictedOutcomes]);

  // Fetch conditions by IDs to get endTime values
  const { data: conditionEnds = [] } = useQuery<
    { id: string; endTime: number }[],
    Error
  >({
    queryKey: ['auctionConditionsEndTimes', conditionIds.sort().join(',')],
    enabled: conditionIds.length > 0,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            endTime
          }
        }
      `;
      const resp = await graphqlRequest<{
        conditions: Array<{ id: string; endTime: number }>;
      }>(CONDITIONS_BY_IDS, { ids: conditionIds });
      return resp?.conditions || [];
    },
  });

  const maxEndTimeSec = useMemo(() => {
    try {
      if (!Array.isArray(conditionEnds) || conditionEnds.length === 0)
        return null;
      const ends = conditionEnds
        .map((c) => Number(c?.endTime || 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ends.length === 0) return null;
      return Math.max(...ends);
    } catch {
      return null;
    }
  }, [conditionEnds]);

  const submitBid = useCallback(
    async (data: {
      amount: string;
      expirySeconds: number;
      mode: 'duration' | 'datetime';
    }) => {
      try {
        if (!auctionId) return;
        // Ensure essential auction context
        const encodedPredicted =
          Array.isArray(predictedOutcomes) && predictedOutcomes[0]
            ? (predictedOutcomes[0] as `0x${string}`)
            : undefined;
        const makerAddr = typeof maker === 'string' ? maker : undefined;
        const resolverAddr =
          typeof resolver === 'string' ? resolver : undefined;
        const makerWagerWei = (() => {
          try {
            return BigInt(String(makerWager ?? '0'));
          } catch {
            return 0n;
          }
        })();
        const makerNonceVal =
          typeof makerNonce === 'number' ? makerNonce : undefined;
        if (
          !encodedPredicted ||
          !makerAddr ||
          !resolverAddr ||
          !makerNonceVal ||
          makerWagerWei <= 0n
        )
          return;

        // Ensure connected wallet
        let taker = address;
        if (!taker) {
          // eslint-disable-next-line @typescript-eslint/await-thenable
          await connectOrCreateWallet();
          // try to read again (wagmi state updates asynchronously)
          taker = (window as any)?.wagmi?.state?.address as
            | `0x${string}`
            | undefined;
        }
        if (!taker) return;

        // Amount in display units -> wei (assume 18)
        const takerWagerWei = parseUnits(String(data.amount || '0'), 18);
        if (takerWagerWei <= 0n) return;

        const takerDeadline =
          Math.floor(Date.now() / 1000) +
          Math.max(0, Number(data.expirySeconds || 0));

        // Build inner message hash (bytes, uint256, uint256, address, address, uint256)
        const innerMessageHash = keccak256(
          encodeAbiParameters(
            parseAbiParameters(
              'bytes, uint256, uint256, address, address, uint256'
            ),
            [
              encodedPredicted,
              takerWagerWei,
              makerWagerWei,
              getAddress(resolverAddr as `0x${string}`),
              getAddress(makerAddr as `0x${string}`),
              BigInt(takerDeadline),
            ]
          )
        );

        // EIP-712 domain and types per SignatureProcessor
        if (!verifyingContract) {
          toast({
            title: 'Signing failed',
            description: 'Missing verifying contract',
            variant: 'destructive' as any,
          });
          return;
        }
        const domain = {
          name: 'SignatureProcessor',
          version: '1',
          chainId: DEFAULT_CHAIN_ID,
          verifyingContract,
        } as const;
        const types = {
          Approve: [
            { name: 'messageHash', type: 'bytes32' },
            { name: 'owner', type: 'address' },
          ],
        } as const;
        const message = {
          messageHash: innerMessageHash,
          owner: getAddress(taker),
        } as const;

        // Sign typed data via wagmi/viem
        let takerSignature: `0x${string}` | null = null;
        try {
          takerSignature = await signTypedDataAsync({
            domain,
            types,
            primaryType: 'Approve',
            message,
          });
        } catch (e: any) {
          toast({
            title: 'Signature rejected',
            description: String(e?.message || e),
          });
          return;
        }
        if (!takerSignature) {
          toast({
            title: 'Signing failed',
            description: 'No signature returned',
            variant: 'destructive' as any,
          });
          return;
        }

        // Build bid payload
        const payload = {
          auctionId,
          taker,
          takerWager: takerWagerWei.toString(),
          takerDeadline,
          takerSignature,
          makerNonce: makerNonceVal,
        };

        // Send over Auction WS and await ack
        if (!wsUrl) return;
        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const ws = new WebSocket(wsUrl);
          const timeout = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
              ws.close();
            } catch {
              void 0;
            }
            reject(new Error('ack_timeout'));
          }, 5000);
          ws.onopen = () => {
            try {
              ws.send(JSON.stringify({ type: 'bid.submit', payload }));
            } catch (e) {
              window.clearTimeout(timeout);
              if (!settled) {
                settled = true;
                try {
                  ws.close();
                } catch {
                  void 0;
                }
                reject(new Error(String(e)));
              }
            }
          };
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              if (msg?.type === 'bid.ack') {
                window.clearTimeout(timeout);
                if (!settled) {
                  settled = true;
                  try {
                    ws.close();
                  } catch {
                    void 0;
                  }
                  if (msg?.payload?.error)
                    reject(new Error(String(msg.payload.error)));
                  else resolve();
                }
              }
            } catch {
              void 0;
            }
          };
          ws.onerror = () => {
            window.clearTimeout(timeout);
            if (!settled) {
              settled = true;
              try {
                ws.close();
              } catch {
                void 0;
              }
              reject(new Error('ws_error'));
            }
          };
          ws.onclose = () => {
            // no-op (handled by ack/timeout)
          };
        });
        toast({
          title: 'Bid submitted',
          description: 'Your bid was submitted successfully.',
        });
      } catch {
        toast({
          title: 'Bid failed',
          description: 'Unable to submit bid',
          variant: 'destructive' as any,
        });
      }
    },
    [
      auctionId,
      predictedOutcomes,
      maker,
      resolver,
      makerWager,
      makerNonce,
      address,
      connectOrCreateWallet,
      wsUrl,
      verifyingContract,
      signTypedDataAsync,
      toast,
    ]
  );

  return (
    <div className={'px-4 py-3 relative group h-full min-h-0'}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* label removed */}
          <div className={'mb-0'}>{predictionsContent}</div>
        </div>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => onTogglePin?.(auctionId || null)}
            className={
              isPinned
                ? 'inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] flex-shrink-0'
                : 'inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-accent text-brand-white hover:text-brand-white text-[10px] flex-shrink-0'
            }
            aria-label={isPinned ? 'Unpin auction' : 'Pin auction'}
          >
            <Pin className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className={
              highlightNewBid
                ? 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 transition-colors duration-300 ease-out bg-[hsl(var(--accent-gold)/0.06)] text-accent-gold animate-[gold-border-pulse_900ms_ease-out_1]'
                : 'inline-flex items-center justify-center h-6 px-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] flex-shrink-0 text-brand-white transition-colors duration-300 ease-out'
            }
            aria-label={
              isExpanded ? `Collapse: ${bidsLabel}` : `Expand: ${bidsLabel}`
            }
          >
            <span className="font-mono">{bidsLabel}</span>
            <ChevronDown
              className={
                (isExpanded
                  ? 'ml-1 h-3.5 w-3.5 rotate-180'
                  : 'ml-1 h-3.5 w-3.5 rotate-0') +
                ' transition-transform duration-300 ease-out'
              }
            />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.div
            key="expanded"
            className="pt-3 grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-stretch min-h-0"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            layout
            style={{ overflow: 'hidden' }}
          >
            <AuctionRequestChart
              bids={bids}
              makerWager={makerWager}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              maker={maker}
              hasMultipleConditions={conditionIds.length > 1}
            />
            <AuctionRequestInfo
              uiTx={uiTx}
              bids={bids}
              makerWager={makerWager}
              collateralAssetTicker={collateralAssetTicker}
              maxEndTimeSec={maxEndTimeSec ?? undefined}
              onSubmit={submitBid}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
};

export default AuctionRequestRow;
