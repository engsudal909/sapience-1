'use client';

import * as React from 'react';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';
import { useConditions } from '~/hooks/graphql/useConditions';
import { hasActivePublicConditions } from './featuredConditions';

export default function Ticker() {
  const [isMounted, setIsMounted] = React.useState(false);
  const { data: conditions } = useConditions({ take: 100 });
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const nowSeconds = React.useMemo(() => Date.now() / 1000, []);
  const hasItems = hasActivePublicConditions(conditions, nowSeconds);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Expose current ticker height so pages can reserve space only when needed.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setHeightVar = () => {
      const nextHeight = hasItems ? `${el.offsetHeight}px` : '0px';
      document.documentElement.style.setProperty('--ticker-height', nextHeight);
    };

    setHeightVar();

    const resizeObserver = new ResizeObserver(setHeightVar);
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.setProperty('--ticker-height', '0px');
    };
  }, [hasItems]);

  return (
    <div
      ref={containerRef}
      className={`absolute bottom-0 left-0 right-0 z-[45] w-full overflow-hidden ${
        hasItems ? 'bg-brand-black' : 'h-[2px]'
      } border-y border-brand-white/10 text-foreground transition-opacity duration-500 ease-out ${
        isMounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <FeaturedMarketGroupCards />
    </div>
  );
}
