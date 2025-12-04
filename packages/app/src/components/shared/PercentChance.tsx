'use client';

import * as React from 'react';
import { formatPercentChance } from '~/lib/format/percentChance';

export interface PercentChanceProps {
  probability: number;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const PercentChance: React.FC<PercentChanceProps> = ({
  probability,
  showLabel = true,
  label = 'Chance',
  className,
}) => {
  const text = formatPercentChance(probability);
  return (
    <span className={className}>{showLabel ? `${text} ${label}` : text}</span>
  );
};

export default PercentChance;
