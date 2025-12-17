'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

interface SliderProps {
  className?: string;
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (value: number[]) => void;
  onValueCommit?: (value: number[]) => void;
  id?: string;
}

const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      className,
      value,
      defaultValue,
      min = 0,
      max = 100,
      step = 1,
      disabled = false,
      onValueChange,
      onValueCommit,
      id,
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = React.useState(
      () => defaultValue ?? [50]
    );

    // Use controlled value if provided, otherwise internal state
    const currentValue = value ?? internalValue;
    const percentage = ((currentValue[0] - min) / (max - min)) * 100;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = [Number(e.target.value)];
      if (value === undefined) {
        // Uncontrolled mode - update internal state
        setInternalValue(newValue);
      }
      onValueChange?.(newValue);
    };

    return (
      <div
        ref={ref}
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          className
        )}
      >
        <div className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-secondary">
          <div
            className="absolute h-full"
            style={{
              width: `${percentage}%`,
              backgroundColor: 'hsl(var(--foreground, var(--primary)))',
            }}
          />
        </div>
        <input
          type="range"
          id={id}
          min={min}
          max={max}
          step={step}
          value={currentValue[0]}
          onChange={handleChange}
          onMouseUp={() => onValueCommit?.(currentValue)}
          onTouchEnd={() => onValueCommit?.(currentValue)}
          disabled={disabled}
          className="absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ margin: 0 }}
        />
        <div
          className="absolute h-7 w-[14px] rounded-sm border cursor-pointer ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          style={{
            left: `calc(${percentage}% - 7px)`,
            backgroundColor: 'hsl(var(--brand-black, var(--background)))',
            borderColor: 'hsl(var(--foreground, var(--brand-white)))',
            pointerEvents: 'none',
          }}
        >
          <span
            className="pointer-events-none flex h-full w-full items-center justify-center"
            aria-hidden
          >
            <span className="flex h-full w-[4px] items-center justify-between">
              <span
                className="block h-[65%] w-px rounded-full"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.55)' }}
              />
              <span
                className="block h-[65%] w-px rounded-full"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.55)' }}
              />
            </span>
          </span>
        </div>
      </div>
    );
  }
);
Slider.displayName = 'Slider';

export default Slider;
