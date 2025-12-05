'use client';

import type * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  Coins,
  CloudSun,
  Landmark,
  FlaskConical,
  Medal,
  Tv,
  TagIcon,
} from 'lucide-react';

// Map category slugs to Lucide icons. Extend as new categories are added.
const categoryIconMap: Record<string, LucideIcon> = {
  'economy-finance': TrendingUp,
  crypto: Coins,
  weather: CloudSun,
  geopolitics: Landmark,
  'tech-science': FlaskConical,
  sports: Medal,
  culture: Tv,
};

export type IconComponentType = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export const getCategoryIcon = (slug?: string | null): IconComponentType => {
  if (!slug) return TagIcon;
  return categoryIconMap[slug] || TagIcon;
};
