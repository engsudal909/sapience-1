'use client';

import type React from 'react';
import { type UiTransaction } from '~/components/markets/DataDrawer/TransactionCells';

type SubmitData = {
  amount: string;
  expirySeconds: number;
  mode: 'duration' | 'datetime';
};

type Props = {
  uiTx: UiTransaction;
  bids: any[] | undefined;
  makerWager: string | null;
  collateralAssetTicker: string;
  onSubmit: (data: SubmitData) => void | Promise<void>;
};

const AuctionRequestInfo: React.FC<Props> = ({
  uiTx: _uiTx,
  bids,
  makerWager,
  collateralAssetTicker,
  onSubmit: _onSubmit,
}) => {
  return (
    <div className="md:col-span-1">
      <div className="text-xs text-muted-foreground">
        New info component (WIP)
      </div>
      <div className="text-xs mt-1">
        <span className="font-mono text-brand-white">{makerWager ?? '0'}</span>{' '}
        <span className="text-muted-foreground">{collateralAssetTicker}</span>
        <span className="ml-2">
          bids: {Array.isArray(bids) ? bids.length : 0}
        </span>
      </div>
    </div>
  );
};

export default AuctionRequestInfo;
