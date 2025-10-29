'use client';

import type React from 'react';
import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  parseUnits,
  encodeAbiParameters,
  parseAbiParameters,
  keccak256,
  getAddress,
} from 'viem';
import { Pin } from 'lucide-react';
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
    <div className="p-4 relative group">
      <button
        type="button"
        onClick={() => onTogglePin?.(auctionId || null)}
        className={
          isPinned
            ? 'absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary text-primary-foreground text-[10px] opacity-100'
            : 'absolute top-2 right-2 inline-flex items-center justify-center h-6 w-6 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-[10px] opacity-0 group-hover:opacity-100 transition-opacity'
        }
        aria-label={isPinned ? 'Unpin auction' : 'Pin auction'}
      >
        <Pin className="h-3 w-3" />
      </button>
      <div className="grid grid-cols-1 gap-2">
        <div>
          <div className="mb-2">{predictionsContent}</div>
        </div>
      </div>

      <motion.div
        className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.8 }}
      >
        <AuctionRequestInfo
          uiTx={uiTx}
          bids={bids}
          makerWager={makerWager}
          collateralAssetTicker={collateralAssetTicker}
          onSubmit={submitBid}
        />
        <AuctionRequestChart bids={bids} />
      </motion.div>
    </div>
  );
};

export default AuctionRequestRow;
