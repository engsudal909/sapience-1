'use client';

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/sdk/ui/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@sapience/sdk/ui/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

export type MultiSelectItem = { value: string; label: string };

type Props = {
  placeholder: string;
  items: MultiSelectItem[];
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
};

const MultiSelect: React.FC<Props> = ({
  placeholder,
  items,
  selected,
  onChange,
  className,
}) => {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    return selected.length === 0 ? placeholder : `${selected.length} selected`;
  }, [placeholder, selected.length]);

  const toggle = useCallback(
    (value: string) => {
      onChange(
        selected.includes(value)
          ? selected.filter((v) => v !== value)
          : [...selected, value]
      );
    },
    [onChange, selected]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            'h-8 w-full rounded-md border border-border bg-background px-3 text-left text-sm inline-flex items-center justify-between' +
            (className ? ' ' + className : '')
          }
        >
          <span
            className={selected.length === 0 ? 'text-muted-foreground' : ''}
          >
            {label}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No options</CommandEmpty>
            <CommandGroup>
              {items.map((it) => {
                const isSelected = selected.includes(it.value);
                return (
                  <CommandItem
                    key={it.value}
                    onSelect={() => toggle(it.value)}
                    className="flex items-center justify-between"
                  >
                    <span>{it.label}</span>
                    <Check
                      className={
                        isSelected ? 'h-4 w-4 opacity-100' : 'h-4 w-4 opacity-0'
                      }
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default MultiSelect;
