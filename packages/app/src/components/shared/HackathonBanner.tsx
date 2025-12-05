'use client';

import Link from 'next/link';

type HackathonBannerProps = {
  className?: string;
};

/**
 * Banner promoting the hackathon, always visible at the top of the page.
 */
const HackathonBanner: React.FC<HackathonBannerProps> = ({ className }) => {
  return (
    <Link
      href="/hackathon"
      className={`fixed top-0 inset-x-0 w-full z-[9998] bg-accent-gold text-brand-black px-4 py-[2px] leading-none text-center font-mono text-[10px] font-bold uppercase tracking-widest hover:opacity-80 transition-opacity duration-300 ease-out cursor-pointer overflow-hidden block whitespace-nowrap ${className ?? ''}`}
    >
      <span className="relative z-10">
        Join our inaugural agent-building hackathon
      </span>
      <span className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />
    </Link>
  );
};

export default HackathonBanner;
