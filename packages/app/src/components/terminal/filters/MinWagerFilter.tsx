'use client';

import type React from 'react';
import { useDeferredValue, useEffect, useState } from 'react';
import { Input } from '@sapience/sdk/ui/components/ui/input';

type Props = {
  value: string;
  onChange: (v: string) => void;
};

const MinWagerFilter: React.FC<Props> = ({ value, onChange }) => {
  const [internal, setInternal] = useState<string>(value);
  const deferred = useDeferredValue(internal);

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
        inputMode="decimal"
        min={0}
        step="0.01"
        className="h-8 rounded-r-none border-r-0"
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
      />
      <span className="inline-flex items-center h-8 rounded-md rounded-l-none border border-input border-l-0 bg-muted/30 px-3 text-xs text-muted-foreground whitespace-nowrap">
        Minimum Wager
      </span>
    </div>
  );
};

export default MinWagerFilter;
