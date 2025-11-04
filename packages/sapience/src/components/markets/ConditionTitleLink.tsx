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
  /**
   * Force a single unbroken line without ellipsis or clipping.
   * Useful for horizontally scrolling tickers where items can exceed viewport width.
   */
  noWrap?: boolean;
};

export default function ConditionTitleLink({
  conditionId,
  title,
  endTime,
  description,
  className,
  clampLines = 1,
  trailing,
  noWrap = false,
}: ConditionTitleLinkProps) {
  // Compute style based on clamp behavior
  const buttonStyle: React.CSSProperties = React.useMemo(() => {
    if (noWrap) {
      return {
        whiteSpace: 'nowrap',
      } as React.CSSProperties;
    }
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
  }, [clampLines, noWrap]);

  // Base clickable styles; prefer text underline for natural width and stable baseline
  const baseClickableClass = (() => {
    const shared = 'font-mono text-brand-white transition-colors break-words';
    if (noWrap) {
      // Force a single continuous line, natural underline
      return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-nowrap underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80`;
    }
    if (clampLines == null) {
      // Wrap mode: inline so trailing can appear directly after the final word
      // Keep link styling with dotted underline
      return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-normal underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80`;
    }
    if (clampLines === 1) {
      // Single-line clamp: use text underline so we don't inflate box height/baseline.
      // Ellipsis is preserved via style (overflow:hidden, text-overflow:ellipsis, white-space:nowrap)
      return `inline align-baseline max-w-full p-0 m-0 bg-transparent ${shared} whitespace-nowrap underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80`;
    }
    // Multi-line clamp: use dotted text underline so it only spans the text width across wrapped lines
    return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-normal underline decoration-dotted decoration-1 decoration-brand-white/40 underline-offset-4 hover:decoration-brand-white/80`;
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
