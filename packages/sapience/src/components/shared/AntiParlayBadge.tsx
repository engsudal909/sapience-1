'use client';

import { HelpCircle } from 'lucide-react';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';

interface AntiParlayBadgeProps {
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
  tooltip?: string;
}

export default function AntiParlayBadge({
  className,
  labelClassName,
  iconClassName,
  tooltip = 'This position is that one or more of these conditions will not be met.',
}: AntiParlayBadgeProps) {
  return (
    <TooltipProvider>
      <div className="inline-flex items-center">
        <Badge
          variant="outline"
          className={`inline-flex items-center gap-1 pr-1 ${className ?? ''}`}
        >
          <span className={labelClassName}>Anti-Parlay</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Anti-Parlay details"
                className={`inline-flex items-center justify-center h-4 w-4 text-muted-foreground hover:text-foreground ${iconClassName ?? ''}`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </Badge>
      </div>
    </TooltipProvider>
  );
}
