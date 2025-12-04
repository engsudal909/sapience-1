'use client';

import * as React from 'react';
import Link from 'next/link';
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
  /**
   * When true, clicking opens a dialog instead of navigating to the question page.
   */
  useDialog?: boolean;
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
  useDialog = false,
}: ConditionTitleLinkProps) {
  // Compute style based on clamp behavior
  const linkStyle: React.CSSProperties = React.useMemo(() => {
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
        display: 'block',
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
  // Dotted underline is brighter by default, dims on hover for subtle interaction feedback
  const baseClickableClass = (() => {
    const shared = 'font-mono text-brand-white transition-colors break-words';
    const underlineStyle =
      'underline decoration-dotted decoration-1 decoration-brand-white/70 underline-offset-4 hover:decoration-brand-white/40';
    if (noWrap) {
      // Force a single continuous line, natural underline
      return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-nowrap ${underlineStyle}`;
    }
    if (clampLines == null) {
      // Wrap mode: inline so trailing can appear directly after the final word
      // Keep link styling with dotted underline
      return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-normal ${underlineStyle}`;
    }
    if (clampLines === 1) {
      // Single-line clamp: use block display so ellipsis works properly.
      // Ellipsis is preserved via style (display:block, overflow:hidden, text-overflow:ellipsis, white-space:nowrap)
      return `block max-w-full p-0 m-0 bg-transparent ${shared} whitespace-nowrap ${underlineStyle}`;
    }
    // Multi-line clamp: use dotted text underline so it only spans the text width across wrapped lines
    return `inline align-baseline p-0 m-0 bg-transparent ${shared} whitespace-normal ${underlineStyle}`;
  })();

  // Build the href for the question page
  const href = conditionId ? `/question/${conditionId}` : '#';

  // Wrapper display: block for single-line clamp, inline otherwise
  const wrapperDisplay = clampLines === 1 ? 'block' : 'inline align-baseline';

  // If useDialog is true, render with Dialog/DialogTrigger
  if (useDialog) {
    return (
      <span
        className={`${wrapperDisplay} min-w-0 max-w-full ${className ?? ''}`}
      >
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className={`${baseClickableClass} min-w-0 max-w-full cursor-pointer`}
              style={linkStyle}
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

  return (
    <span className={`${wrapperDisplay} min-w-0 max-w-full ${className ?? ''}`}>
      <Link
        href={href}
        className={`${baseClickableClass} min-w-0 max-w-full`}
        style={linkStyle}
      >
        {title}
      </Link>
      {trailing ? (
        <>
          {' '}
          <span className="ml-1 align-baseline">{trailing}</span>
        </>
      ) : null}
    </span>
  );
}
