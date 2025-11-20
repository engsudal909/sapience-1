import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Label } from '@sapience/sdk/ui/components/ui/label';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import CollateralBalance from './CollateralBalance';
import { getChainShortName } from '~/lib/utils/util';

interface WagerInputProps {
  name?: string;
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  chainId?: number;
  // Optional minimum amount (human units) to enforce via validation
  minAmount?: string | number;
  // Hide the label and the buttons to the right of the label
  hideHeader?: boolean;
  // Additional classes for the input element (e.g., height overrides)
  inputClassName?: string;
}

// Define the wager schema that will be used across all forms
export const wagerAmountSchema = z
  .string()
  .min(1, '')
  .refine((val) => Number(val) > 0, {
    message: 'Amount must be greater than 0',
  });

export function WagerInput({
  name = 'wagerAmount',
  collateralSymbol,
  collateralAddress = '0x0000000000000000000000000000000000000000',
  chainId = 432,
  minAmount,
  hideHeader = false,
  inputClassName,
}: WagerInputProps) {
  const {
    register,
    formState: { errors },
    setError,
    clearErrors,
    getValues,
    trigger,
    setValue,
  } = useFormContext();
  const chainShortName = getChainShortName(chainId);

  // Validate the wager amount independently using the schema
  useEffect(() => {
    const validateWagerAmount = () => {
      const currentValue = getValues(name);
      if (!currentValue) return; // Don't validate empty values

      try {
        // Build dynamic schema if a minimum amount is provided
        const schema = wagerAmountSchema;

        // Validate against our (possibly dynamic) schema
        schema.parse(currentValue);
        clearErrors(name);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Set the first error message
          const firstError = error.errors[0];
          setError(name, {
            type: 'manual',
            message: firstError?.message ?? 'Invalid wager amount',
          });
        }
      }
    };

    validateWagerAmount();
  }, [name, getValues, clearErrors, setError, minAmount]);

  return (
    <div className="space-y-2">
      {!hideHeader && (
        <div className="flex justify-between items-center">
          <Label htmlFor={`${name}-input`}>Wager Amount</Label>
          <CollateralBalance
            collateralSymbol={collateralSymbol}
            collateralAddress={collateralAddress}
            chainId={chainId}
            chainShortName={chainShortName}
            onSetWagerAmount={(amount) =>
              setValue(name, amount, {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              })
            }
          />
        </div>
      )}
      <div className="relative">
        <Input
          id={`${name}-input`}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize="none"
          className={`pr-24 text-brand-white placeholder:text-brand-white/70 ${
            errors[name] ? 'border-destructive' : ''
          } ${inputClassName || ''}`}
          {...register(name, {
            validate: (val) => {
              if (!val) return '';
              if (Number(val) <= 0) return 'Amount must be greater than 0';
              return true;
            },
            onChange: (e) => {
              // Allow only numbers and a single decimal point
              const { value } = e.target;
              const cleanedValue = value.replace(/[^0-9.]/g, '');

              // Handle multiple decimal points
              const parts = cleanedValue.split('.');
              if (parts.length > 2) {
                const newValue = `${parts[0]}.${parts.slice(1).join('')}`;
                setValue(name, newValue, { shouldValidate: false });
                return;
              }

              if (value !== cleanedValue) {
                setValue(name, cleanedValue, { shouldValidate: false });
              }

              // Trigger validation
              trigger(name);
            },
          })}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-white flex items-center pointer-events-none">
          {collateralSymbol}
        </div>
      </div>
      {typeof minAmount !== 'undefined' &&
        Number(getValues(name) || 0) < Number(minAmount) && (
          <p className="text-xs text-muted-foreground mt-1">
            Minimum: {minAmount} {collateralSymbol}
          </p>
        )}
      {errors[name] &&
        (errors[name]?.message ? (
          <p className="text-destructive text-sm mb-2">
            {errors[name]?.message?.toString()}
          </p>
        ) : null)}
    </div>
  );
}
