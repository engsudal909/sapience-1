'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/ui/components/ui/button';
import { Badge } from '@sapience/ui/components/ui/badge';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@sapience/ui/components/ui/hover-card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/ui/components/ui/dialog';
import { ArrowRight } from 'lucide-react';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useSession } from '~/lib/context/SessionContext';
import { STARGATE_DEPOSIT_URL } from '~/lib/constants';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';

/**
 * Calculate time until next weekly distribution (every Monday at 00:00 UTC)
 */
function getNextDistributionCountdown(): string {
  const now = new Date();
  const nextMonday = new Date(now);

  // Find next Monday
  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);

  const diff = nextMonday.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
}

/**
 * Formats a balance as dollar-like: max 2 decimal places, no trailing zeros.
 * e.g. 1234.567 → "1234.57", 100.00 → "100", 50.10 → "50.1"
 */
function formatDollarLikeBalance(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  // Round to 2 decimal places
  const rounded = Math.round(num * 100) / 100;

  // Format without trailing zeros
  if (Number.isInteger(rounded)) {
    return rounded.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function CollateralBalanceButton({
  className,
  buttonClassName,
}: CollateralBalanceButtonProps) {
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];
  const chainId = useChainIdFromLocalStorage();
  const eoaAddress = connectedWallet?.address as `0x${string}` | undefined;

  // Get smart account address from session context
  const { smartAccountAddress, isCalculatingAddress } = useSession();

  // Get EOA balance (connected wallet)
  const { balance: eoaBalance, symbol } = useCollateralBalance({
    address: eoaAddress,
    chainId,
  });

  // Get smart account balance
  const { balance: smartAccountBalance } = useCollateralBalance({
    address: smartAccountAddress as `0x${string}` | undefined,
    chainId,
    enabled: Boolean(smartAccountAddress),
  });

  const formattedBalance = `${formatDollarLikeBalance(smartAccountBalance)} ${symbol}`;
  const [nextDistribution, setNextDistribution] = useState(getNextDistributionCountdown());
  const [isGetUsdeOpen, setIsGetUsdeOpen] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setNextDistribution(getNextDistributionCountdown());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
      <HoverCard openDelay={100} closeDelay={200}>
        <HoverCardTrigger>
          <div
            className={`inline-flex items-center rounded-md h-9 px-3 min-w-[122px] justify-start gap-2 bg-brand-black text-brand-white border border-ethena/40 hover:bg-brand-black/90 font-mono shadow-[0_0_12px_rgba(136,180,245,0.3)] hover:shadow-[0_0_18px_rgba(136,180,245,0.5)] transition-shadow cursor-default text-sm ${buttonClassName ?? ''}`}
          >
            <div className="flex items-center gap-2">
              <Image
                src="/usde.svg"
                alt="USDe"
                width={20}
                height={20}
                className="opacity-90 ml-[-2px] w-5 h-5"
              />
              <span className="relative top-[1px] md:top-0 text-sm font-normal">
                {formattedBalance}
              </span>
            </div>
            <div className="inline-flex items-center ml-1 w-fit -mr-1">
              <Badge
                variant="outline"
                className="rounded-md border-ethena/80 bg-ethena/20 font-normal text-xs h-5 flex items-center px-2 tracking-[0.08em] shadow-[0_0_10px_rgba(136,180,245,0.25)]"
              >
                5% APY
              </Badge>
            </div>
          </div>
        </HoverCardTrigger>
        <HoverCardContent side="bottom" className="w-auto p-4">
          <div className="flex items-center gap-4">
            {/* Left section - Get USDe */}
            <div className="flex flex-col items-center justify-center min-w-[120px] space-y-3">
              <div className="space-y-2 text-center">
                <p className="font-medium text-sm">Ethereal Predict<br />Account Balance</p>
                <p className="text-lg font-mono">{formattedBalance}</p>
              </div>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setIsGetUsdeOpen(true)}
              >
                <Image
                  src="/usde.svg"
                  alt="USDe"
                  width={16}
                  height={16}
                  className="opacity-90"
                />
                Get USDe
              </Button>
            </div>

            {/* Vertical separator */}
            <div className="h-20 w-px bg-border" />

            {/* Right section - Distribution info */}
            <div className="space-y-3 text-center min-w-[160px]">
              <div className="space-y-2">
                <p className="font-medium text-sm">Automatic Reward<br />Distributions Weekly</p>
                <p className="text-muted-foreground text-xs font-mono uppercase">
                  Next distribution in<br />{nextDistribution}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
              >
                Claim Rewards
              </Button>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* Get USDe Dialog */}
      <Dialog open={isGetUsdeOpen} onOpenChange={setIsGetUsdeOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Get USDe</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Transfer USDe on Ethereal to your Ethereal Predict account to get started.
            </p>

            <div className="flex items-stretch gap-3">
              <Button
                className="flex-1 h-11 text-sm"
                onClick={() => window.open(STARGATE_DEPOSIT_URL, '_blank')}
              >
                <Image
                  src="/usde.svg"
                  alt="USDe"
                  width={16}
                  height={16}
                  className="opacity-90"
                />
                Bridge via Stargate
              </Button>

              {/* Spacer to match the arrow gap */}
              <div className="px-1 shrink-0" style={{ width: '28px' }} />

              <Button
                variant="outline"
                className="flex-1 h-11 text-sm"
              >
                Transfer from Wallet
              </Button>
            </div>

            {/* Two Account Cards */}
            <div className="flex items-stretch gap-3">
              {/* Ethereum Account Card */}
              <div className="flex-1 rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ethereum Account</p>
                  {eoaAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar address={eoaAddress} width={16} height={16} />
                      <AddressDisplay
                        address={eoaAddress}
                        compact
                      />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">Not connected</span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-lg font-medium">
                      {formatDollarLikeBalance(eoaBalance)}
                    </span>
                    <span className="text-sm text-muted-foreground">{symbol}</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center px-1">
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Ethereal Predict Account Card */}
              <div className="flex-1 rounded-lg border border-ethena/40 bg-brand-black p-4 space-y-3 shadow-[0_0_12px_rgba(136,180,245,0.15)]">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ethereal Predict Account</p>
                  {isCalculatingAddress ? (
                    <span className="font-mono text-sm text-muted-foreground">Calculating...</span>
                  ) : smartAccountAddress ? (
                    <div className="flex items-center gap-2">
                      <EnsAvatar address={smartAccountAddress} width={16} height={16} />
                      <AddressDisplay
                        address={smartAccountAddress}
                        compact
                      />
                    </div>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">Not available</span>
                  )}
                </div>
                <div className="pt-3 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-lg font-medium text-brand-white">
                      {formatDollarLikeBalance(smartAccountBalance)}
                    </span>
                    <span className="text-sm text-muted-foreground">{symbol}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
