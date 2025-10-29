'use client';

import type React from 'react';
import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
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

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [approveAmount, setApproveAmount] = useState<string>('');

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
    spenderAddress: SPENDER_ADDRESS,
    amount: approveAmount,
    chainId: DEFAULT_CHAIN_ID,
    decimals: tokenDecimals,
    enabled: Boolean(COLLATERAL_ADDRESS && SPENDER_ADDRESS),
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

  return (
    <div className="border border-border rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border/60 bg-muted/10">
        <div className="flex items-center justify-between">
          <div className="eyebrow text-foreground">Auto-Bid</div>
          <span className="font-mono text-[10px] leading-none text-accent-gold tracking-widest">
            EXPERIMENTAL
          </span>
        </div>
      </div>
      <div className="p-4 flex-1 min-h-0">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-muted-foreground">
            <span className="mr-3">
              <span className="text-foreground/80">Approved:</span>{' '}
              {allowanceDisplay} USDe
            </span>
            <span>
              <span className="text-foreground/80">Balance:</span>{' '}
              {balanceDisplay} USDe
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center"
            aria-label="Manage USDe allowance and balance"
            onClick={() => setIsDialogOpen(true)}
          >
            <Pencil className="h-3 w-3 text-accent-gold" />
          </button>
        </div>

        <div className="border border-border/60 rounded-md p-6 text-center text-sm text-muted-foreground">
          <div>Coming soon</div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-border/60 text-[11px] text-muted-foreground text-center">
        Limit orders coming soon
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Manage USDe</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Current approved</span>
                <span className="text-foreground">{allowanceDisplay} USDe</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span>Wallet balance</span>
                <span className="text-foreground">{balanceDisplay} USDe</span>
              </div>
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
                  isApproving ||
                  !COLLATERAL_ADDRESS ||
                  !SPENDER_ADDRESS
                }
              >
                {isApproving ? 'Approving…' : 'Approve'}
              </Button>
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
