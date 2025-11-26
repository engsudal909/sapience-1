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
      <section className="rounded-md border border-border/60 bg-muted/5 p-1 flex flex-col min-h-[110px]">
        {
          <div className="flex-1 min-h-0">
            <div className="h-[110px] overflow-y-auto overflow-x-auto pr-1">
              <ul className="space-y-1">
                {logs.map((entry, index) => {
                  const cleanedMessage = entry.message
                    .replace(/^\s*\d{1,2}:\d{2}:\d{2}\s*·?\s*/, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                  const severityClass =
                    LOG_SEVERITY_CLASSES[entry.severity ?? 'info'] ||
                    LOG_SEVERITY_CLASSES.info;
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

                  // Find the verb in the message (bid, paused, resumed, skipped, etc.)
                  const verbMatch = cleanedMessage.match(
                    /\b(bid|paused|resumed|created|updated|cancelled|skipped)\b/i
                  );
                  const verbIndex = verbMatch?.index ?? -1;
                  const verb = verbMatch?.[0] ?? '';

                  // Build prefix: everything up to and including the verb
                  // If we have a resolved label, use that + verb instead of the raw message prefix
                  let prefix: string;
                  let suffix: string;

                  if (verbIndex >= 0) {
                    const rawPrefix = cleanedMessage.slice(
                      0,
                      verbIndex + verb.length
                    );
                    // If we have a label like "#2 COPY", use it instead of just "#2"
                    if (resolvedOrderLabel && rawPrefix.match(/^#\d+/)) {
                      prefix = `${resolvedOrderLabel} ${verb}`;
                    } else {
                      prefix = rawPrefix;
                    }
                    suffix = cleanedMessage
                      .slice(verbIndex + verb.length)
                      .trim();
                  } else {
                    // No verb found - show whole message in severity color
                    prefix = '';
                    suffix = cleanedMessage;
                  }

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
                      <span className="shrink-0">
                        {prefix && (
                          <span className="text-brand-white">{prefix} </span>
                        )}
                        <span className={severityClass}>{suffix}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        }
      </section>
    </div>
  );
};

export default LogsPanel;
