'use client';

import type React from 'react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Input } from '@sapience/sdk/ui/components/ui/input';

type Props = {
  value: string;
  onChange: (v: string) => void;
};

const MinBidsFilter: React.FC<Props> = ({ value, onChange }) => {
  const [internal, setInternal] = useState<string>(value);
  const deferred = useDeferredValue(internal);
  const label = useMemo(() => {
    const n = parseInt(deferred || '0', 10);
    const valid = Number.isFinite(n) ? Math.max(0, n) : 0;
    return valid === 1 ? 'Minimum Bid' : 'Minimum Bids';
  }, [deferred]);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    const id = window.setTimeout(() => onChange(deferred), 180);
    return () => window.clearTimeout(id);
  }, [deferred, onChange]);

  return (
    <div className="flex">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        className="h-8 rounded-r-none border-r-0"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
      />
      <span className="inline-flex items-center h-8 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {label}
      </span>
    </div>
  );
};

export default MinBidsFilter;
