'use client';

import * as React from 'react';
import { findBadgeForLabel } from '~/lib/marketBadges';

export interface MarketBadgeProps {
  label: string;
  size?: number; // px
  className?: string;
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

export default function MarketBadge({ label, size = DEFAULT_SIZE, className }: MarketBadgeProps) {
  const filename = React.useMemo(() => findBadgeForLabel(label), [label]);
  const dimension = `${size}px`;

  if (filename) {
    const src = `/market-badges/${filename}`;
    return (
      <div
        className={['rounded-full overflow-hidden shrink-0 bg-background/50', className].filter(Boolean).join(' ')}
        style={{ width: dimension, height: dimension }}
        aria-label={label}
        title={label}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          width={size}
          height={size}
          className="w-full h-full object-contain"
          loading="lazy"
        />
      </div>
    );
  }

  const initials = getInitials(label);
  return (
    <div
      className={['rounded-full shrink-0 bg-muted text-foreground/80 flex items-center justify-center select-none', className].filter(Boolean).join(' ')}
      style={{ width: dimension, height: dimension, fontSize: `${Math.max(10, Math.floor(size * 0.45))}px`, fontWeight: 600 }}
      aria-label={label}
      title={label}
    >
      {initials}
    </div>
  );
}


