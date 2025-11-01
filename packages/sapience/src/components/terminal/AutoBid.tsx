'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, isAddress } from 'viem';
import { Pencil } from 'lucide-react';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { predictionMarket } from '@sapience/sdk/contracts';
import { DEFAULT_COLLATERAL_ASSET } from '~/components/admin/constants';
import erc20Abi from '@sapience/sdk/queries/abis/erc20abi.json';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { useTokenApproval } from '~/hooks/contract/useTokenApproval';
import { formatFiveSigFigs, getChainShortName } from '~/lib/utils/util';

const AutoBid: React.FC = () => {
  const { address } = useAccount();

  const COLLATERAL_ADDRESS = DEFAULT_COLLATERAL_ASSET as
    | `0x${string}`
    | undefined;
  const SPENDER_ADDRESS = predictionMarket[DEFAULT_CHAIN_ID]?.address as
    | `0x${string}`
    | undefined;

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'decimals',
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: Boolean(COLLATERAL_ADDRESS) },
  });

  const { data: rawBalance } = useReadContract({
    abi: erc20Abi,
    address: COLLATERAL_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: Boolean(address && COLLATERAL_ADDRESS) },
  });

  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [approveAmount, setApproveAmount] = useState<string>('');
  const [spenderAddressInput, setSpenderAddressInput] = useState<string>(
    (SPENDER_ADDRESS as string | undefined) ?? ''
  );

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

  const {
    allowance,
    isLoadingAllowance,
    approve,
    isApproving,
    isApproveSuccess,
    refetchAllowance,
  } = useTokenApproval({
    tokenAddress: COLLATERAL_ADDRESS,
    spenderAddress: (spenderAddressInput || SPENDER_ADDRESS) as
      | `0x${string}`
      | undefined,
    amount: approveAmount,
    chainId: DEFAULT_CHAIN_ID,
    decimals: tokenDecimals,
    enabled: Boolean(
      COLLATERAL_ADDRESS && (spenderAddressInput || SPENDER_ADDRESS)
    ),
  });

  const allowanceDisplay = useMemo(() => {
    try {
      if (allowance == null) return '0';
      const human = Number(
        formatUnits(allowance as unknown as bigint, tokenDecimals)
      );
      return formatFiveSigFigs(human);
    } catch {
      return '0';
    }
  }, [allowance, tokenDecimals]);

  const chainShortName = getChainShortName(DEFAULT_CHAIN_ID);
  const buyUrl = COLLATERAL_ADDRESS
    ? `https://swap.defillama.com/?chain=${chainShortName}&to=${COLLATERAL_ADDRESS}`
    : undefined;
  const bridgeUrl = COLLATERAL_ADDRESS
    ? `https://jumper.exchange/?toChain=${chainShortName}&toToken=${COLLATERAL_ADDRESS}`
    : undefined;
  const isSpenderValid = useMemo(
    () =>
      spenderAddressInput
        ? isAddress(spenderAddressInput as `0x${string}`)
        : !!SPENDER_ADDRESS,
    [spenderAddressInput]
  );

  return (
    <div className="border border-border/60 rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 bg-muted/10 min-h-[56px]">
        <div className="flex items-center justify-between">
          <div className="eyebrow text-foreground">Auto-Bid</div>
          <span className="font-mono text-[10px] leading-none text-accent-gold tracking-[0.18em]">
            EXPERIMENTAL
          </span>
        </div>
      </div>
      <div className="p-4 flex-1 min-h-0 flex flex-col">
        <div className="mb-3">
          <div className="grid grid-cols-2 gap-2">
            {/* Left: Approved Spend */}
            <div className="px-1">
              <div className="text-xs font-medium">Approved Spend</div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {allowanceDisplay} testUSDe
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  aria-label="Edit approved spend"
                  onClick={() => setIsApproveDialogOpen(true)}
                >
                  <Pencil className="h-3 w-3 text-accent-gold" />
                </button>
              </div>
            </div>

            {/* Right: Account Balance */}
            <div className="px-1">
              <div className="text-xs font-medium">Account Balance</div>
              <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
                {balanceDisplay} testUSDe
                <button
                  type="button"
                  className="inline-flex items-center justify-center"
                  aria-label="Add/bridge USDe"
                  onClick={() => setIsBalanceDialogOpen(true)}
                >
                  <Pencil className="h-3 w-3 text-accent-gold" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative border border-border/60 rounded-md flex-1 min-h-0 overflow-hidden">
          {/* Mock UI content */}
          <div className="pointer-events-none p-4 md:p-6 h-full">
            <div className="space-y-4 h-full flex flex-col">
              <div className="grid grid-cols-2 gap-3">
                <div className="h-6 rounded bg-muted/20" />
                <div className="h-6 rounded bg-muted/20" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="h-24 rounded-md bg-muted/20" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-9 rounded-md bg-muted/20" />
                <div className="h-9 rounded-md bg-muted/20" />
              </div>
              <div className="flex-1 rounded-md bg-muted/20" />
            </div>
          </div>

          {/* Overlay CTA */}
          <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm bg-background/20 rounded-md overflow-hidden">
            <div className="text-center px-4">
              <p className="text-xs text-muted-foreground">
                Request early access in{' '}
                <a
                  href="https://discord.gg/sapience"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-white underline decoration-dotted underline-offset-4"
                >
                  Discord
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Balance dialog: bridge/onramp */}
      <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Add USDe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Wallet balance</span>
                <span className="text-foreground">{balanceDisplay} USDe</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {buyUrl ? (
                <a
                  href={buyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm"
                >
                  Buy USDe
                </a>
              ) : null}
              {bridgeUrl ? (
                <a
                  href={bridgeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center h-9 px-3 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground text-sm"
                >
                  Bridge USDe
                </a>
              ) : null}
            </div>

            <div className="text-xs text-muted-foreground">
              Buying opens an external DEX aggregator. Bridging opens a
              cross-chain bridge.
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approved spend dialog: edit allowance and spender */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit approved spend</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Current approved</span>
                <span className="text-foreground">{allowanceDisplay} USDe</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Spender address
              </label>
              <Input
                type="text"
                placeholder={SPENDER_ADDRESS ?? '0x...'}
                value={spenderAddressInput}
                onChange={(e) => setSpenderAddressInput(e.target.value.trim())}
                className="h-9 font-mono text-[12px]"
              />
              {!isSpenderValid ? (
                <div className="text-[11px] text-red-400 mt-1">
                  Enter a valid address
                </div>
              ) : null}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Set approve amount
              </label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={approveAmount}
                onChange={(e) => setApproveAmount(e.target.value.trim())}
                className="h-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await approve();
                    setTimeout(() => refetchAllowance(), 2000);
                  } catch {
                    // no-op
                  }
                }}
                disabled={
                  !approveAmount ||
                  !isSpenderValid ||
                  isApproving ||
                  !COLLATERAL_ADDRESS
                }
              >
                {isApproving ? 'Approving…' : 'Approve'}
              </Button>
            </div>

            {isLoadingAllowance ? (
              <div className="text-xs text-muted-foreground">
                Refreshing allowance…
              </div>
            ) : isApproveSuccess ? (
              <div className="text-xs text-emerald-400">
                Approval submitted.
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AutoBid;
