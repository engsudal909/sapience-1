'use client';

import type React from 'react';
import EnsAvatar from '~/components/shared/EnsAvatar';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import PercentChance from '~/components/shared/PercentChance';

type TradePopoverContentProps = {
  leftAddress: string;
  rightAddress: string;
  takerAmountEth: number;
  totalAmountEth: number;
  percent?: number;
  ticker: string;
  timeLabel?: string | null;
  timeNode?: React.ReactNode;
};

const TradePopoverContent: React.FC<TradePopoverContentProps> = ({
  leftAddress,
  rightAddress: _rightAddress,
  takerAmountEth,
  totalAmountEth,
  percent,
  ticker,
  timeLabel,
  timeNode,
}) => {
  const takerStr = Number.isFinite(takerAmountEth)
    ? takerAmountEth.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
  const toWinStr = Number.isFinite(totalAmountEth)
    ? totalAmountEth.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';

  return (
    <div className="text-xs">
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="align-baseline">
            <span className="font-mono font-semibold text-brand-white">
              {takerStr} {ticker}
            </span>{' '}
            <span className="text-muted-foreground">to win</span>{' '}
            <span className="font-mono font-semibold text-brand-white">
              {toWinStr} {ticker}
            </span>
          </span>
          {typeof percent === 'number' ? (
            <PercentChance
              probability={percent / 100}
              showLabel={true}
              label="Chance"
              className="font-mono text-brand-white ml-2"
            />
          ) : (
            <span />
          )}
        </div>
        <div className="flex items-center justify-between mt-0">
          <div className="inline-flex items-center gap-1 min-w-0 text-muted-foreground">
            <div className="inline-flex items-center gap-1 min-w-0">
              <EnsAvatar
                address={leftAddress || ''}
                className="w-4 h-4 rounded-sm ring-1 ring-border/50 shrink-0"
                width={16}
                height={16}
              />
              <div className="min-w-0">
                <AddressDisplay address={leftAddress || ''} compact />
              </div>
            </div>
          </div>
          {timeNode ? (
            <div className="text-xs whitespace-nowrap ml-2">{timeNode}</div>
          ) : timeLabel ? (
            <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
              {timeLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default TradePopoverContent;
