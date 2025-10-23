'use client';

import * as React from 'react';
import { Dialog, DialogTrigger } from '@sapience/sdk/ui/components/ui/dialog';
import ConditionDialog from '~/components/markets/ConditionDialog';

export type ConditionTitleLinkProps = {
  conditionId?: string;
  title: string;
  endTime?: number | null;
  description?: string | null;
  className?: string;
  /**
   * When null, allow natural wrapping with no ellipsis.
   * When 1, single-line with ellipsis.
   * When >1, apply Webkit line clamp to that many lines.
   */
  clampLines?: number | null;
  /**
   * Optional element to render immediately after the title (e.g., a Badge).
   */
  trailing?: React.ReactNode;
};

export default function ConditionTitleLink({
  conditionId,
  title,
  endTime,
  description,
  className,
  clampLines = 1,
  trailing,
}: ConditionTitleLinkProps) {
  // Compute style based on clamp behavior
  const buttonStyle: React.CSSProperties = React.useMemo(() => {
    if (clampLines == null) {
      return {};
    }
    if (clampLines === 1) {
      return {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      } as React.CSSProperties;
    }
    return {
      display: '-webkit-box',
      WebkitLineClamp: clampLines,
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    } as React.CSSProperties;
  }, [clampLines]);

  // Base clickable styles; prefer underline for natural width, and use dotted bottom border to include ellipsis when single-line clamped
  const baseClickableClass = (() => {
    const shared =
      'font-mono text-brand-white transition-colors whitespace-normal break-words';
    if (clampLines == null) {
      // Wrap mode: inline so trailing can appear directly after the final word
      // Keep link styling with dotted underline
      return `inline align-baseline p-0 m-0 bg-transparent ${shared} underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80`;
    }
    if (clampLines === 1) {
      // Single-line clamp: inline-block so the border width follows the rendered text width
      // (stops at text when short, reaches ellipsis when truncated)
      return `inline-block max-w-full align-baseline p-0 m-0 bg-transparent ${shared} border-b border-dotted border-brand-white/40 pb-[1px] hover:border-brand-white/80`;
    }
    // Multi-line clamp: block + bottom dotted border (spans the full container width)
    return `block w-full text-left p-0 m-0 bg-transparent ${shared} border-b border-dotted border-brand-white/40 pb-[1px] hover:border-brand-white/80`;
  })();

  return (
    <span
      className={`inline align-baseline min-w-0 max-w-full ${className ?? ''}`}
    >
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className={`${baseClickableClass} min-w-0 max-w-full`}
            style={buttonStyle}
          >
            {title}
          </button>
        </DialogTrigger>
        <ConditionDialog
          conditionId={conditionId}
          title={title}
          endTime={endTime}
          description={description}
        />
      </Dialog>
      {trailing ? (
        <>
          {' '}
          <span className="ml-1 align-baseline">{trailing}</span>
        </>
      ) : null}
    </span>
  );
}
