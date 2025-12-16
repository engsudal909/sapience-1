import * as React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

export interface ColoredRadioOptionProps {
  label: React.ReactNode;
  color?: string; // optional; not used for Yes/No
  variant?: 'yes' | 'no';
  checked: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
}

export const ColoredRadioOption: React.FC<ColoredRadioOptionProps> = ({
  label,
  color,
  variant,
  checked,
  onClick,
  className,
  disabled,
}) => {
  // Determine yes/no variant
  const labelText = typeof label === 'string' ? label : '';
  const detectYes = /\byes\b/i.test(labelText);
  const detectNo = /\bno\b/i.test(labelText);
  const resolvedVariant: 'yes' | 'no' | undefined = variant ?? (detectYes ? 'yes' : detectNo ? 'no' : undefined);

  const variantClasses =
    resolvedVariant === 'yes'
      ? 'border-green-500 bg-green-500/10 text-foreground hover:bg-green-500/15'
      : resolvedVariant === 'no'
        ? 'border-red-500 bg-red-500/10 text-foreground hover:bg-red-500/15'
        : '';

  return (
    <Button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'text-center justify-start text-base font-semibold border flex items-center gap-3',
        resolvedVariant ? variantClasses : 'text-foreground',
        className
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full w-4 h-4 border-2',
          resolvedVariant === 'yes'
            ? 'border-green-500'
            : resolvedVariant === 'no'
              ? 'border-red-500'
              : 'border-border'
        )}
        aria-hidden
      >
        {checked ? (
          <span
            className={cn(
              'block rounded-full w-2 h-2',
              resolvedVariant === 'yes'
                ? 'bg-green-500'
                : resolvedVariant === 'no'
                  ? 'bg-red-500'
                  : 'bg-foreground'
            )}
          />
        ) : null}
      </span>
      <span className="truncate">{label}</span>
    </Button>
  );
};

export default ColoredRadioOption;


