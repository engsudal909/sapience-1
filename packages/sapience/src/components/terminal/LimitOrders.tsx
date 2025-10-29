'use client';

import type React from 'react';

const LimitOrders: React.FC = () => {
  return (
    <div className="border border-border rounded-lg bg-brand-black text-brand-white h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-border/60 bg-muted/10">
        <div className="eyebrow text-foreground">Limit orders</div>
      </div>
      <div className="p-4 flex-1 min-h-0">
        <div className="border border-border/60 rounded-md p-6 text-center text-sm text-muted-foreground">
          Coming soon
        </div>
      </div>
    </div>
  );
};

export default LimitOrders;
