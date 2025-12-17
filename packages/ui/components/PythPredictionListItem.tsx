'use client';

import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export type PythPrediction = {
  id: string;
  priceId: string;
  priceFeedLabel?: string;
  direction: 'over' | 'under';
  targetPrice: number;
  targetPriceRaw?: string;
  targetPriceFullPrecision?: string;
  dateTimeLocal: string;
};

export type PythPredictionListItemProps = {
  prediction: PythPrediction;
  onRemove?: (id: string) => void;
};

export function PythPredictionListItem({
  prediction,
  onRemove,
}: PythPredictionListItemProps) {
  const insightsHref = prediction.priceFeedLabel
    ? `https://insights.pyth.network/price-feeds/${encodeURIComponent(
        prediction.priceFeedLabel
      )}`
    : null;

  const [canMask, setCanMask] = React.useState(false);
  React.useEffect(() => {
    try {
      const ok =
        typeof CSS !== 'undefined' &&
        (CSS.supports('mask-image', 'url("")') ||
          CSS.supports('-webkit-mask-image', 'url("")'));
      setCanMask(!!ok);
    } catch {
      setCanMask(false);
    }
  }, []);

  const parseLocalDateTime = (value: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!m) return null;
    const yyyy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);
    const hh = Number(m[4]);
    const min = Number(m[5]);
    const d = new Date(yyyy, mm - 1, dd, hh, min);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatRelative = (d: Date): string => {
    const diffMs = d.getTime() - Date.now();
    const future = diffMs >= 0;
    const absSec = Math.max(0, Math.round(Math.abs(diffMs) / 1000));

    const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
      { unit: 'year', seconds: 365 * 24 * 60 * 60 },
      { unit: 'month', seconds: 30 * 24 * 60 * 60 },
      { unit: 'week', seconds: 7 * 24 * 60 * 60 },
      { unit: 'day', seconds: 24 * 60 * 60 },
      { unit: 'hour', seconds: 60 * 60 },
      { unit: 'minute', seconds: 60 },
    ];

    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });

    for (const u of units) {
      if (absSec >= u.seconds) {
        const value = Math.round(absSec / u.seconds);
        return rtf.format(future ? value : -value, u.unit).replace(/^in\s+/i, 'in ');
      }
    }

    return future ? 'in moments' : 'moments ago';
  };

  const dt = parseLocalDateTime(prediction.dateTimeLocal);
  const timeLabel = dt ? formatRelative(dt) : prediction.dateTimeLocal;
  const timeLabelNoIn = timeLabel.replace(/^in\s+/i, '');
  const timeTooltip = (() => {
    if (!dt) return prediction.dateTimeLocal;
    try {
      // Avoid `dateStyle/timeStyle` for compatibility with some Intl implementations.
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      }).format(dt);
    } catch {
      try {
        return dt.toLocaleString(undefined, { timeZoneName: 'short' });
      } catch {
        return prediction.dateTimeLocal;
      }
    }
  })();

  const priceDisplay = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(prediction.targetPrice);
  const priceTooltip =
    prediction.targetPriceFullPrecision ||
    prediction.targetPriceRaw ||
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 18 }).format(
      prediction.targetPrice
    );

  return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center bg-brand-white/10">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center">
                {canMask ? (
                  <span
                    aria-hidden
                    className="w-4 h-4 text-foreground"
                    style={{
                      backgroundColor: 'currentColor',
                      WebkitMaskImage: 'url(/pyth-network.svg)',
                      maskImage: 'url(/pyth-network.svg)',
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                    }}
                  />
                ) : (
                  <img src="/pyth-network.svg" alt="Pyth" className="w-4 h-4" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              <span className="text-muted-foreground">Oracle:</span>{'  '}
              <span className="font-mono">PYTH</span>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-md text-foreground">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              {insightsHref ? (
                <a
                  href={insightsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-full p-0 m-0 bg-transparent font-mono text-brand-white transition-colors break-words whitespace-nowrap underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4 hover:decoration-brand-white/40 truncate"
                >
                  {prediction.priceFeedLabel}
                </a>
              ) : (
                <div className="truncate text-brand-white font-mono">
                  {prediction.priceFeedLabel || prediction.priceId}
                </div>
              )}
              <div className="mt-0.5 truncate text-xs text-muted-foreground font-mono uppercase">
                {prediction.direction === 'over' ? 'Over' : 'Under'}{' '}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help inline-block underline decoration-dotted decoration-1 decoration-brand-white/50 underline-offset-2 hover:decoration-brand-white/70">
                        ${priceDisplay}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="font-mono text-xs">
                      ${priceTooltip}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>{' '}
                in{' '}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help inline-block underline decoration-dotted decoration-1 decoration-brand-white/50 underline-offset-2 hover:decoration-brand-white/70">
                        {timeLabelNoIn}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">{timeTooltip}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => onRemove?.(prediction.id)}
        className="text-[22px] leading-none text-muted-foreground hover:text-foreground"
        type="button"
        aria-label="Remove"
      >
        ×
      </button>
    </div>
  );
}


