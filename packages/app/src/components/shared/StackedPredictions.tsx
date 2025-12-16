'use client';

import { Badge } from '@sapience/ui/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { getCategoryIcon } from '~/lib/theme/categoryIcons';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';
import MarketBadge from '~/components/markets/MarketBadge';

export interface Pick {
  question: string;
  choice: 'Yes' | 'No';
  conditionId?: string;
  categorySlug?: string | null;
  endTime?: number | null;
  description?: string | null;
}

interface StackedPredictionsProps {
  legs: Pick[];
  /** Show icons stacked before the question (default: true) */
  showIcons?: boolean;
  /** Additional className for the container */
  className?: string;
  /** Maximum width class for the question text (default: 'max-w-[300px]') */
  maxWidthClass?: string;
}

function getCategoryColor(slug?: string | null): string {
  return getCategoryStyle(slug).color;
}

/**
 * Renders just the stacked category icons portion.
 * Can be used separately when icons need to be in a different cell/container.
 */
export function StackedIcons({
  legs,
  className,
}: {
  legs: Pick[];
  className?: string;
}) {
  if (!legs || legs.length === 0) {
    return null;
  }

  const colors = legs.map((leg) => getCategoryColor(leg.categorySlug));

  return (
    <div className={`flex items-center -space-x-2 ${className ?? ''}`}>
      {legs.map((leg, i) => {
        const CategoryIcon = getCategoryIcon(leg.categorySlug);
        const color = colors[i] || 'hsl(var(--muted-foreground))';
        return (
          <div
            key={`icon-${leg.conditionId || i}-${i}`}
            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center ring-2 ring-background"
            style={{
              backgroundColor: color,
              zIndex: legs.length - i,
            }}
          >
            <CategoryIcon className="h-3 w-3 text-white/80" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Renders just the question + badge + "and N predictions" popover portion.
 * Can be used separately when the title needs to be in a different cell/container.
 */
export function StackedPredictionsTitle({
  legs,
  className,
  maxWidthClass = 'max-w-[300px]',
}: {
  legs: Pick[];
  className?: string;
  maxWidthClass?: string;
}) {
  if (!legs || legs.length === 0) {
    return null;
  }

  const firstLeg = legs[0];
  const remainingLegs = legs.slice(1);
  const remainingCount = remainingLegs.length;

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className ?? ''}`}>
      <span className={`text-sm ${maxWidthClass} truncate`}>
        <ConditionTitleLink
          conditionId={firstLeg.conditionId}
          title={firstLeg.question}
          clampLines={1}
        />
      </span>
      <Badge
        variant="outline"
        className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
          firstLeg.choice === 'Yes'
            ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
            : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90'
        }`}
      >
        {firstLeg.choice === 'Yes' ? 'YES' : 'NO'}
      </Badge>

      {/* "and N predictions" popover */}
      {remainingCount > 0 && (
        <>
          <span className="text-sm text-muted-foreground shrink-0">and</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-sm text-brand-white hover:text-brand-white/80 underline decoration-dotted underline-offset-2 shrink-0 transition-colors"
              >
                {remainingCount} {remainingCount === 1 ? 'other' : 'others'}
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto max-w-sm p-0 bg-brand-black border-brand-white/20"
              align="start"
            >
              <div className="flex flex-col divide-y divide-brand-white/20">
                {remainingLegs.map((leg, i) => (
                  <div
                    key={`${leg.conditionId || i}-${i}`}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <MarketBadge
                      label={leg.question}
                      size={32}
                      color={getCategoryColor(leg.categorySlug)}
                      categorySlug={leg.categorySlug}
                    />
                    <ConditionTitleLink
                      conditionId={leg.conditionId}
                      title={leg.question}
                      clampLines={1}
                      className="text-sm"
                    />
                    <Badge
                      variant="outline"
                      className={`shrink-0 w-9 px-0 py-0.5 text-xs font-medium !rounded-md font-mono flex items-center justify-center ${
                        leg.choice === 'Yes'
                          ? 'border-emerald-500 bg-emerald-500/50 dark:bg-emerald-500/70 text-emerald-900 dark:text-white/90'
                          : 'border-rose-500 bg-rose-500/50 dark:bg-rose-500/70 text-rose-900 dark:text-white/90'
                      }`}
                    >
                      {leg.choice === 'Yes' ? 'YES' : 'NO'}
                    </Badge>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}

/**
 * Displays multiple predictions with stacked category icons,
 * the first question title with a YES/NO badge,
 * and "and N predictions" link with a popover for the rest.
 *
 * This is the combined component that renders both icons and title together.
 * For split layouts (e.g., icons in one cell, title in another), use
 * `StackedIcons` and `StackedPredictionsTitle` separately.
 */
export default function StackedPredictions({
  legs,
  showIcons = true,
  className,
  maxWidthClass = 'max-w-[300px]',
}: StackedPredictionsProps) {
  if (!legs || legs.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="flex flex-col xl:flex-row xl:items-center gap-2 min-w-0">
        {showIcons && <StackedIcons legs={legs} />}
        <StackedPredictionsTitle legs={legs} maxWidthClass={maxWidthClass} />
      </div>
    </div>
  );
}
