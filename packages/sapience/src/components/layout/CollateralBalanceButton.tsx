'use client';

import Image from 'next/image';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useEffectiveBalance } from '~/hooks/blockchain/useEffectiveBalance';

const STARGATE_DEPOSIT_URL =
  'https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

interface CollateralBalanceButtonProps {
  className?: string;
  buttonClassName?: string;
  onClick?: () => void;
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
  onClick,
}: CollateralBalanceButtonProps) {
  const { wallets } = useWallets();
  const connectedWallet = wallets[0];
  const chainId = useChainIdFromLocalStorage();
  const accountAddress = connectedWallet?.address as `0x${string}` | undefined;

  const { balance, symbol } = useCollateralBalance({
    address: accountAddress,
    chainId,
  });

  const { isLowBalance } = useEffectiveBalance();

  const formattedBalance = `${formatDollarLikeBalance(balance)} ${symbol}`;

  // Show Deposit button when balance is low
  if (isLowBalance) {
    return (
      <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
        <Button
          variant="outline"
          size="xs"
          asChild
          className={`rounded-md h-9 px-4 gap-2 bg-brand-black text-brand-white border-ethena/50 hover:bg-brand-black/80 hover:border-ethena/70 font-mono shadow-[0_0_12px_rgba(145,179,240,0.3)] hover:shadow-[0_0_16px_rgba(145,179,240,0.4)] transition-all ${buttonClassName ?? ''}`}
        >
          <a
            href={STARGATE_DEPOSIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClick}
          >
            <span className="text-sm font-medium uppercase tracking-widest">
              Deposit
            </span>
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex w-fit mx-3 md:mx-0 mt-0 ${className ?? ''}`}>
      <Button
        asChild
        variant="outline"
        size="xs"
        className={`rounded-md h-9 px-3 min-w-[122px] justify-start gap-2 bg-brand-black text-brand-white border border-brand-white/10 hover:bg-brand-black/90 font-mono ${buttonClassName ?? ''}`}
      >
        <a
          href={STARGATE_DEPOSIT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClick}
          className="flex items-stretch justify-between gap-2 w-full"
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
        </a>
      </Button>
    </div>
  );
}
