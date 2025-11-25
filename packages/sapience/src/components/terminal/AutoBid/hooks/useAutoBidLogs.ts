import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AutoBidLogEntry,
  AutoBidLogKind,
  AutoBidLogSeverity,
  AutoBidLogMeta,
} from '../types';
import { readLogsFromStorage, writeLogsToStorage } from '../storage';

export type PushLogEntryParams = {
  kind: AutoBidLogKind;
  message: string;
  severity?: AutoBidLogSeverity;
  meta?: AutoBidLogMeta | null;
  dedupeKey?: string | null;
};

export function useAutoBidLogs() {
  const [logs, setLogs] = useState<AutoBidLogEntry[]>([]);
  const hasHydratedLogsRef = useRef(false);
  const recentLogKeysRef = useRef<Set<string>>(new Set());
  const logKeyQueueRef = useRef<string[]>([]);

  // Hydrate logs from storage on mount
  useEffect(() => {
    const storedLogs = readLogsFromStorage();
    if (storedLogs.length > 0) {
      setLogs(storedLogs);
    }
    hasHydratedLogsRef.current = true;
  }, []);

  // Persist logs to storage when they change
  useEffect(() => {
    if (!hasHydratedLogsRef.current) {
      return;
    }
    writeLogsToStorage(logs);
  }, [logs]);

  const pushLogEntry = useCallback((entry: PushLogEntryParams) => {
    const { dedupeKey, ...rest } = entry;
    if (dedupeKey) {
      const keys = recentLogKeysRef.current;
      if (keys.has(dedupeKey)) {
        return;
      }
      keys.add(dedupeKey);
      logKeyQueueRef.current.push(dedupeKey);
      if (logKeyQueueRef.current.length > 400) {
        const oldest = logKeyQueueRef.current.shift();
        if (oldest) {
          keys.delete(oldest);
        }
      }
    }

    setLogs((prev) => {
      const next: AutoBidLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        kind: rest.kind,
        message: rest.message,
        severity: rest.severity ?? 'info',
        meta: rest.meta ?? null,
      };
      return [next, ...prev].slice(0, 200);
    });
  }, []);

  return {
    logs,
    setLogs,
    pushLogEntry,
  };
}
