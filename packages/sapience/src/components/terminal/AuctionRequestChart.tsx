'use client';

import type React from 'react';
import AuctionBidsChart from '~/components/terminal/AuctionBidsChart';

type Props = {
  bids: any[] | undefined;
  refreshMs?: number;
};

const AuctionRequestChart: React.FC<Props> = ({ bids, refreshMs = 250 }) => {
  return (
    <div className="md:col-span-1">
      <div className="h-[160px]">
        <AuctionBidsChart bids={bids} continuous refreshMs={refreshMs} />
      </div>
    </div>
  );
};

export default AuctionRequestChart;
