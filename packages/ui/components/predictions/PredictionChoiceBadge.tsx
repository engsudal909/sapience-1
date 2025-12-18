'use client';

import * as React from 'react';

import { Badge } from '../ui/badge';
import type { PredictionChoice } from './types';

export type PredictionChoiceBadgeProps = {
  choice: PredictionChoice | string;
  className?: string;
};

function normalizeChoice(choice: string): PredictionChoice | null {
  const c = String(choice || '').trim().toUpperCase();
  if (c === 'YES' || c === 'NO' || c === 'OVER' || c === 'UNDER') return c;
  return null;
}

function isPositive(choice: PredictionChoice): boolean {
  return choice === 'YES' || choice === 'OVER';
}

export function PredictionChoiceBadge({
  choice,
  className,
}: PredictionChoiceBadgeProps) {
  const normalized = normalizeChoice(String(choice));
  const label = normalized ?? String(choice || '').toUpperCase();
  const positive = normalized ? isPositive(normalized) : false;

  return (
    <Badge
      variant="outline"
      className={[
        'shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center',
        positive
          ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
          : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {label}
    </Badge>
  );
}


