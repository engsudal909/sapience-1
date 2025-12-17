import { useFormContext } from 'react-hook-form';
import { useState, useRef } from 'react';
import { Label } from '@sapience/ui/components/ui/label';
import { formatPercentChance } from '~/lib/format/percentChance';

interface YesNoPredictProps {
  name?: string;
  disabled?: boolean;
}

export default function YesNoPredict({
  name = 'predictionValue',
  disabled = false,
}: YesNoPredictProps) {
  const { register, setValue } = useFormContext();
  const [sliderValue, setSliderValue] = useState(50);
  const isUpdatingRef = useRef(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUpdatingRef.current) return;
    isUpdatingRef.current = true;
    const newValue = Number(e.target.value);
    setSliderValue(newValue);
    setValue(name, newValue.toString(), { shouldValidate: true });
    isUpdatingRef.current = false;
  };

  const percentage = sliderValue;

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <Label className="text-lg font-normal">
          <span className="text-muted-foreground">Forecast:</span>{' '}
          <span className="font-mono text-ethena text-lg">
            {formatPercentChance(sliderValue / 100)} chance
          </span>
        </Label>
        <div className="relative flex w-full touch-none select-none items-center">
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
            min={0}
            max={100}
            step={1}
            value={sliderValue}
            onChange={handleChange}
            disabled={disabled}
            className="absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            style={{ margin: 0 }}
          />
          <div
            className="absolute h-7 w-[14px] rounded-sm border cursor-pointer"
            style={{
              left: `calc(${percentage}% - 7px)`,
              backgroundColor: 'hsl(var(--brand-black, var(--background)))',
              borderColor: 'hsl(var(--foreground, var(--brand-white)))',
              pointerEvents: 'none',
            }}
          >
            <span className="pointer-events-none flex h-full w-full items-center justify-center">
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
      </div>
      {/* Hidden input for form submission */}
      <input type="hidden" {...register(name)} />
    </div>
  );
}
