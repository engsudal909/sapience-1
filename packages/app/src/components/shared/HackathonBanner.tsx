'use client';

import Link from 'next/link';
import { useBannerHeight } from '~/hooks/useBannerHeight';

type HackathonBannerProps = {
  className?: string;
  showWhenLowBalanceHidden?: boolean;
};

/**
 * Banner promoting the hackathon.
 * Only shows when LowBalanceBanner is not visible (LowBalanceBanner takes priority).
 */
const HackathonBanner: React.FC<HackathonBannerProps> = ({
  className,
  showWhenLowBalanceHidden = true,
}) => {
  const bannerRef = useBannerHeight();

  // Only render when LowBalanceBanner is hidden
  if (!showWhenLowBalanceHidden) return null;

  return (
    <Link
      ref={bannerRef}
      href="/hackathon"
      className={`relative w-full z-[9998] bg-accent-gold text-brand-black px-4 py-1 leading-none text-center font-mono text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap ${className ?? ''}`}
    >
      <span className="relative z-10">
        Join our inaugural agent-building hackathon
      </span>
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </Link>
  );
};

export default HackathonBanner;
