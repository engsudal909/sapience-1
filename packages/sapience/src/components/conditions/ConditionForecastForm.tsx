import React, { useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, useForm } from 'react-hook-form';

import { Button } from '@sapience/sdk/ui/components/ui/button';
import YesNoPredict from '~/components/markets/forms/inputs/YesNoPredict';
import { useSubmitPrediction } from '~/hooks/forms/useSubmitPrediction';
import { MarketGroupClassification } from '~/lib/types';
import { YES_SQRT_X96_PRICE } from '~/lib/constants/numbers';
import MarketBadge from '~/components/markets/MarketBadge';
import { FOCUS_AREAS } from '~/lib/constants/focusAreas';
import { getDeterministicCategoryColor } from '~/lib/theme/categoryPalette';
import ConditionTitleLink from '~/components/markets/ConditionTitleLink';

export interface ConditionForecastFormProps {
  conditionId: string;
  question: string;
  endTime?: number;
  onSuccess?: () => void;
  disabled?: boolean;
  categorySlug?: string | null;
}

type FormValues = { predictionValue: string; comment?: string };

const ConditionForecastForm: React.FC<ConditionForecastFormProps> = ({
  conditionId,
  question,
  endTime,
  onSuccess,
  disabled = false,
  categorySlug,
}) => {
  const { address } = useAccount();
  const formSchema: z.ZodType<FormValues> = useMemo(() => {
    return z.object({
      predictionValue: z
        .string()
        .min(1)
        .refine(
          (val) =>
            BigInt(val) >= BigInt(0) &&
            BigInt(val) <= BigInt(YES_SQRT_X96_PRICE),
          {
            message: 'Please select Yes or No',
          }
        ),
      comment: z.string().optional(),
    });
  }, []);

  const defaultPredictionValue: string = useMemo(() => {
    const yesBigInt = BigInt(YES_SQRT_X96_PRICE);
    const half = (yesBigInt * BigInt(500000)) / BigInt(1000000);
    return half.toString();
  }, []);

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { predictionValue: defaultPredictionValue, comment: '' },
    mode: 'onChange',
  });

  useEffect(() => {
    methods.setValue('predictionValue', defaultPredictionValue);
  }, [defaultPredictionValue, methods]);

  const predictionValue = methods.watch('predictionValue');
  const comment = methods.watch('comment');

  // Conditions-only: placeholders for market data
  const marketAddress = '0x0000000000000000000000000000000000000000';
  const marketId = 0;

  const { submitPrediction, isAttesting } = useSubmitPrediction({
    marketAddress,
    marketClassification: MarketGroupClassification.YES_NO,
    submissionValue: predictionValue,
    marketId,
    comment,
    onSuccess,
    conditionIdHex: conditionId as `0x${string}`,
  });

  const handleSubmit = async () => {
    await submitPrediction();
  };

  return (
    <FormProvider {...(methods as any)}>
      <form onSubmit={methods.handleSubmit(handleSubmit)} className="space-y-3">
        <div className="flex items-center gap-2">
          {(() => {
            const slug = categorySlug || '';
            const fa = FOCUS_AREAS.find((fa) => fa.id === slug);
            const color = fa?.color || getDeterministicCategoryColor(slug);
            return (
              <MarketBadge
                categorySlug={slug}
                label={question}
                size={24}
                color={color}
              />
            );
          })()}
          <ConditionTitleLink
            conditionId={conditionId}
            title={question}
            endTime={endTime}
            className="text-lg md:text-xl"
            clampLines={2}
          />
        </div>

        <YesNoPredict disabled={disabled || isAttesting} />

        <div className="pt-3">
          <textarea
            id="comment"
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-4 py-3 text-lg ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Why are these your odds?"
            {...methods.register('comment')}
            disabled={disabled || isAttesting}
          />
        </div>

        <div>
          <Button
            type="submit"
            disabled={
              !methods.formState.isValid || disabled || isAttesting || !address
            }
            className="w-full py-6 px-5 rounded text-lg font-normal"
          >
            {isAttesting ? 'Forecasting…' : 'Submit Forecast'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

export default ConditionForecastForm;
