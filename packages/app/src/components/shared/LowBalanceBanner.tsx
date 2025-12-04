'use client';

import { useEffect, useState } from 'react';
import { useEffectiveBalance } from '~/hooks/blockchain/useEffectiveBalance';

const STARGATE_DEPOSIT_URL =
  'https://stargate.finance/?dstChain=ethereal&dstToken=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

type LowBalanceBannerProps = {
  className?: string;
};

/**
 * Banner displayed when the user's balance is low or fully allocated as margin.
 * Uses fixed positioning with high z-index to overlay above all content.
 */
const LowBalanceBanner: React.FC<LowBalanceBannerProps> = ({ className }) => {
  const { isLowBalance, isLoading, isConnected } = useEffectiveBalance();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't show if not connected, still loading, or balance is fine
  if (!isConnected || isLoading || !isLowBalance) return null;

  // Don't render on server or before hydration
  if (!mounted) return null;

  return (
    <a
      href={STARGATE_DEPOSIT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed top-0 z-[9999] bg-ethena text-brand-black px-0 md:px-4 py-[2px] leading-none text-center font-mono text-[10px] font-semibold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap left-1/2 -translate-x-1/2 w-[264px] rounded-b-md md:left-0 md:translate-x-0 md:inset-x-0 md:w-full md:rounded-none ${className ?? ''}`}
    >
      <span className="relative z-10">
        Deposit Ethereal USDe to get started
      </span>
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </a>
  );
};

export default LowBalanceBanner;
