import type React from 'react';
import type { AutoBidLogEntry } from '../types';
import { LOG_SEVERITY_CLASSES } from '../constants';
import { formatLogDisplayTime } from '../utils';
import { cn } from '~/lib/utils/util';

export type LogsPanelProps = {
  logs: AutoBidLogEntry[];
  orderLabelById: Record<string, string>;
};

const LogsPanel: React.FC<LogsPanelProps> = ({ logs, orderLabelById }) => {
  if (logs.length === 0) {
    return null;
  }

  return (
    <div className="px-1 flex flex-col justify-end animate-in fade-in duration-200">
      <div className="text-xs font-medium text-muted-foreground mb-1">Logs</div>
      <section className="rounded-md border border-border/60 bg-muted/5 p-1 flex flex-col min-h-[140px]">
        <div className="flex-1 min-h-0">
          <div className="h-36 overflow-y-auto pr-1">
            <ul className="space-y-1">
              {logs.map((entry, index) => {
                const cleanedMessage = entry.message
                  .replace(/^\s*\d{1,2}:\d{2}:\d{2}\s*·?\s*/, '')
                  .replace(/\s+/g, ' ')
                  .trim();
                const severityClass =
                  LOG_SEVERITY_CLASSES[entry.severity ?? 'info'] ||
                  LOG_SEVERITY_CLASSES.info;
                const highlightText =
                  typeof entry.meta?.highlight === 'string'
                    ? entry.meta.highlight
                    : null;
                const derivedLabel =
                  typeof entry.meta?.orderId === 'string'
                    ? (orderLabelById[entry.meta.orderId] ?? null)
                    : null;
                const storedSnapshot =
                  typeof entry.meta?.labelSnapshot === 'string'
                    ? entry.meta.labelSnapshot
                    : null;
                const resolvedOrderLabel =
                  derivedLabel ?? storedSnapshot ?? null;
                const messageWithoutLegacyTag = cleanedMessage
                  .replace(/^#\d+\s*/, '')
                  .trimStart();
                const displayMessage = resolvedOrderLabel
                  ? `${resolvedOrderLabel} ${messageWithoutLegacyTag}`.trim()
                  : cleanedMessage;
                const highlightIndex =
                  highlightText && displayMessage.includes(highlightText)
                    ? displayMessage.indexOf(highlightText)
                    : -1;
                const hasHighlight = highlightIndex >= 0;
                const beforeText = hasHighlight
                  ? displayMessage.slice(0, highlightIndex)
                  : displayMessage;
                const afterText =
                  hasHighlight && highlightText
                    ? displayMessage.slice(
                        highlightIndex + highlightText.length
                      )
                    : '';
                const baseMessageClass = hasHighlight
                  ? 'text-brand-white/90'
                  : severityClass;
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex items-center gap-2 text-[11px] font-mono whitespace-nowrap pr-1 rounded-sm px-2 py-1',
                      index % 2 === 1 ? 'bg-muted/30' : ''
                    )}
                  >
                    <span className="text-muted-foreground/70 shrink-0">
                      {formatLogDisplayTime(entry.createdAt)}
                    </span>
                    <span
                      className={cn(
                        'flex min-w-0 items-center gap-0.5 truncate',
                        baseMessageClass
                      )}
                    >
                      <span className="truncate">{beforeText}</span>
                      {hasHighlight && highlightText ? (
                        <>
                          <span className="shrink-0 whitespace-pre"> </span>
                          <span className={cn('shrink-0', severityClass)}>
                            {highlightText}
                          </span>
                          <span className="truncate">{afterText}</span>
                        </>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LogsPanel;
