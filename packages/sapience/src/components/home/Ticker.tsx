'use client';

import * as React from 'react';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';
import { useConditions } from '~/hooks/graphql/useConditions';

export default function Ticker() {
  const [isMounted, setIsMounted] = React.useState(false);
  const { data: conditions, isLoading } = useConditions({
    take: 100,
  });

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Don't render anything while loading or if there are no active public conditions
  if (isLoading) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const hasActiveConditions = conditions?.some((c) => {
    if (typeof c.endTime !== 'number' || c.endTime <= 0) return false;
    if (!c.public) return false;
    return now <= c.endTime;
  });

  // Hide the entire ticker section if there are no active conditions
  if (!hasActiveConditions) {
    return null;
  }

  return (
    <div
      className={`h-[134px] w-full overflow-hidden bg-brand-black text-foreground transition-opacity duration-500 ease-out ${
        isMounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <FeaturedMarketGroupCards />
    </div>
  );
}
