'use client';

import * as React from 'react';
import { findBadgeForLabel } from '~/lib/marketBadges';

export interface MarketBadgeProps {
  label: string;
  size?: number; // px
  className?: string;
  color?: string; // category color (hsl(...), rgb(...), or #hex)
}

const DEFAULT_SIZE = 32;

function getInitials(label: string): string {
  const cleaned = label.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();
  if (!cleaned) return '?';
  const words = cleaned.split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  const first = words[0][0] || '';
  const last = words[words.length - 1][0] || '';
  return (first + last).toUpperCase();
}

export default function MarketBadge({
  label,
  size = DEFAULT_SIZE,
  className,
  color,
}: MarketBadgeProps) {
  const filename = React.useMemo(() => findBadgeForLabel(label), [label]);
  const dimension = `${size}px`;

  const withAlpha = React.useCallback((c: string, alpha: number) => {
    const hexMatch = /^#(?:[0-9a-fA-F]{3}){1,2}$/;
    if (hexMatch.test(c)) {
      const a = Math.max(0, Math.min(1, alpha));
      const aHex = Math.round(a * 255)
        .toString(16)
        .padStart(2, '0');
      return `${c}${aHex}`;
    }
    const toSlashAlpha = (fn: 'hsl' | 'rgb', inside: string) =>
      `${fn}(${inside} / ${alpha})`;
    if (c.startsWith('hsl(')) return toSlashAlpha('hsl', c.slice(4, -1));
    if (c.startsWith('rgb(')) return toSlashAlpha('rgb', c.slice(4, -1));
    return c;
  }, []);

  if (filename) {
    const src = `/market-badges/${filename}`;
    const bgColor = color ? withAlpha(color, 0.1) : undefined;
    const fgColor = color || undefined;
    return (
      <div
        className={[
          'rounded-full overflow-hidden shrink-0 p-2',
          color ? '' : 'bg-muted',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: dimension,
          height: dimension,
          backgroundColor: bgColor,
        }}
        aria-label={label}
        title={label}
      >
        <div
          role="img"
          aria-hidden="true"
          style={
            {
              width: '100%',
              height: '100%',
              backgroundColor: fgColor,
              WebkitMaskImage: `url(${src})`,
              WebkitMaskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              WebkitMaskSize: 'contain',
              maskImage: `url(${src})`,
              maskRepeat: 'no-repeat',
              maskPosition: 'center',
              maskSize: 'contain',
            } as React.CSSProperties
          }
        />
      </div>
    );
  }

  const initials = getInitials(label);
  const style: React.CSSProperties = color
    ? {
        backgroundColor: withAlpha(color, 0.1),
        color,
        width: dimension,
        height: dimension,
        fontSize: `${Math.max(10, Math.floor(size * 0.45))}px`,
        fontWeight: 600,
      }
    : {
        width: dimension,
        height: dimension,
        fontSize: `${Math.max(10, Math.floor(size * 0.45))}px`,
        fontWeight: 600,
      };
  return (
    <div
      className={[
        'rounded-full shrink-0 flex items-center justify-center select-none',
        color ? '' : 'bg-muted text-foreground/80',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-label={label}
      title={label}
    >
      {initials}
    </div>
  );
}
