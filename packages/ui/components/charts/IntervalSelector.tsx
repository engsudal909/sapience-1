import { ChevronDown } from 'lucide-react';
import { TimeInterval } from '@sapience/sdk/types';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '../../lib/utils';

interface IntervalSelectorProps {
  selectedInterval: TimeInterval;
  setSelectedInterval: (interval: TimeInterval) => void;
}

// Helper to get display text for intervals
const intervalLabels: Record<TimeInterval, string> = {
  [TimeInterval.I5M]: '5m',
  [TimeInterval.I15M]: '15m',
  [TimeInterval.I30M]: '30m',
  [TimeInterval.I4H]: '4h',
  [TimeInterval.I1D]: '1d',
};

export const IntervalSelector = ({
  selectedInterval,
  setSelectedInterval,
}: IntervalSelectorProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="flex items-center justify-between h-8 px-3 py-1"
        >
          <span>{intervalLabels[selectedInterval]}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-0 max-w-[160px] w-auto overflow-auto">
        {Object.entries(intervalLabels).map(([intervalKey, label]) => (
          <DropdownMenuItem
            key={intervalKey}
            onClick={() => setSelectedInterval(intervalKey as TimeInterval)}
            className={cn(
              'text-sm p-1.5 whitespace-normal break-words',
              selectedInterval === (intervalKey as TimeInterval)
                ? 'bg-accent text-accent-foreground'
                : ''
            )}
          >
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
