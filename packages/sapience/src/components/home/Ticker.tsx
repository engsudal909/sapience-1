'use client';

import * as React from 'react';
import FeaturedMarketGroupCards from './FeaturedMarketGroupCards';

export default function Ticker() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setIsMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
