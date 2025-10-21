'use client';

import * as React from 'react';
import { RefreshCw, SquareStackIcon } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sapience/sdk/ui/components/ui/tooltip';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Dialog, DialogTrigger } from '@sapience/sdk/ui/components/ui/dialog';
import {
  useConditions,
  type ConditionType,
} from '~/hooks/graphql/useConditions';
import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import { getCategoryStyle } from '~/lib/utils/categoryStyle';
import MarketPredictionRequest from '~/components/shared/MarketPredictionRequest';
import ConditionDialog from '~/components/markets/ConditionDialog';

type SuggestedBetslipsProps = {
  onRefresh?: () => void;
  className?: string;
};

const SuggestedBetslips: React.FC<SuggestedBetslipsProps> = ({
  onRefresh,
  className,
}) => {
  const [nonce, setNonce] = React.useState(0);
  const { data: allConditions = [], isLoading } = useConditions({ take: 200 });
  const { addParlaySelection } = useBetSlipContext();

  const handleRefresh = React.useCallback(() => {
    setNonce((n) => n + 1);
    onRefresh?.();
  }, [onRefresh]);

  const getCategoryColor = React.useCallback((slug?: string | null) => {
    return getCategoryStyle(slug).color;
  }, []);

  const combos = React.useMemo(() => {
    const nowSec = Math.floor(Date.now() / 1000);
    const publicConditions = (allConditions || []).filter((c) => {
      if (!c.public) return false;
      const end = typeof c.endTime === 'number' ? c.endTime : 0;
      return end > nowSec; // only include future-ending conditions
    });
    if (publicConditions.length === 0)
      return [] as Array<
        Array<{ condition: ConditionType; prediction: boolean }>
      >;

    const byCategory = publicConditions.reduce<Record<string, ConditionType[]>>(
      (acc, c) => {
        const slug = c.category?.slug || 'uncategorized';
        if (!acc[slug]) acc[slug] = [];
        acc[slug].push(c);
        return acc;
      },
      {}
    );

    const categorySlugs = Object.keys(byCategory);
    const pickRandom = <T,>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];

    const makeOneCombo = (): Array<{
      condition: ConditionType;
      prediction: boolean;
    }> => {
      const result: Array<{ condition: ConditionType; prediction: boolean }> =
        [];

      // Prefer three distinct categories if available
      const shuffledCats = [...categorySlugs].sort(() => Math.random() - 0.5);
      for (const cat of shuffledCats) {
        if (result.length >= 3) break;
        const pool = byCategory[cat];
        if (!pool || pool.length === 0) continue;
        result.push({
          condition: pickRandom(pool),
          prediction: Math.random() < 0.5,
        });
      }

      // Fallback: fill remaining legs from any remaining conditions (avoid duplicates)
      if (result.length < 3) {
        const usedIds = new Set(result.map((r) => r.condition.id));
        const remaining = publicConditions.filter((c) => !usedIds.has(c.id));
        while (result.length < 3 && remaining.length > 0) {
          const idx = Math.floor(Math.random() * remaining.length);
          const [picked] = remaining.splice(idx, 1);
          result.push({ condition: picked, prediction: Math.random() < 0.5 });
        }
      }

      return result.slice(0, 3);
    };

    // Always prepare three combos; UI will hide extras on smaller screens
    const comboCount = 3;
    return Array.from({ length: comboCount }, () => makeOneCombo());
  }, [allConditions, nonce]);

  return (
    <div className={'w-full ' + (className ?? '')}>
      <div className="p-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm text-muted-foreground">
            Featured Parlays
          </h3>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleRefresh}
                  aria-label="Randomize featured parlays"
                  className="text-muted-foreground hover:text-foreground p-1 rounded-md"
                  title="Randomize featured parlays"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Randomize featured parlays</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="mt-3 mb-0 pb-0 grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
        {isLoading || combos.length === 0 ? (
          <>
            <div className="border border-border rounded bg-card overflow-hidden shadow-md h-20 flex items-center justify-center text-muted-foreground/80">
              Loading…
            </div>
            <div className="border border-border rounded bg-card overflow-hidden shadow-md h-20 hidden lg:flex items-center justify-center text-muted-foreground/80">
              Loading…
            </div>
            <div className="border border-border rounded bg-card overflow-hidden shadow-md h-20 hidden lg:flex items-center justify-center text-muted-foreground/80">
              Loading…
            </div>
          </>
        ) : (
          combos.map((combo, idx) => (
            <div
              key={`combo-${idx}`}
              className={`border border-border rounded bg-card overflow-hidden shadow-md p-0 ${idx > 0 ? 'hidden lg:block' : ''}`}
            >
              <div className="space-y-0 flex flex-col">
                {combo.map((leg, i) => (
                  <div
                    key={leg.condition.id + '-' + i}
                    className="border-b border-border last:border-b-0 flex-1"
                  >
                    <div className="flex items-stretch">
                      <div
                        className="w-1 self-stretch"
                        style={{
                          backgroundColor: getCategoryColor(
                            leg.condition.category?.slug
                          ),
                          // Extend 1px to cover parent's border-b on non-last rows
                          marginBottom: -1,
                        }}
                      />
                      <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center justify-between gap-3">
                        <h3 className="text-sm text-foreground truncate">
                          <Dialog>
                            <DialogTrigger asChild>
                              <button
                                type="button"
                                className="text-left w-full"
                              >
                                <span className="underline decoration-1 decoration-foreground/10 underline-offset-4 transition-colors hover:decoration-foreground/60">
                                  {leg.condition.shortName ||
                                    leg.condition.question}
                                </span>
                              </button>
                            </DialogTrigger>
                            <ConditionDialog
                              conditionId={leg.condition.id}
                              title={
                                leg.condition.shortName ||
                                leg.condition.question
                              }
                              endTime={leg.condition.endTime}
                              description={leg.condition.description}
                            />
                          </Dialog>
                        </h3>
                        <span className="relative -top-0.5 ml-2 shrink-0">
                          <Badge
                            variant="outline"
                            className={`${leg.prediction ? 'px-2 py-0.5 text-xs font-medium border-green-500/40 bg-green-500/10 text-green-600 dark:bg-emerald-500/70 dark:text-foreground shrink-0' : 'px-2 py-0.5 text-xs font-medium border-red-500/40 bg-red-500/10 text-red-600 dark:bg-rose-500/70 dark:text-foreground shrink-0'}`}
                          >
                            {leg.prediction ? 'Yes' : 'No'}
                          </Badge>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex items-stretch">
                  <div className="w-1 self-stretch bg-foreground" />
                  <div className="flex-1 pl-3 pr-2 py-3">
                    <div className="text-sm mb-2.5 px-0.5 flex items-center gap-1">
                      <span className="text-muted-foreground">
                        Market Prediction:
                      </span>
                      <MarketPredictionRequest
                        key={`mpr-${nonce}-${combo
                          .map(
                            (leg) =>
                              `${leg.condition.id}:${leg.prediction ? '1' : '0'}`
                          )
                          .join('|')}`}
                        outcomes={combo.map((leg) => ({
                          marketId: leg.condition.id,
                          prediction: leg.prediction,
                        }))}
                      />
                    </div>
                    <Button
                      className="w-full gap-2"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        combo.forEach((leg) => {
                          addParlaySelection({
                            conditionId: leg.condition.id,
                            question:
                              leg.condition.shortName || leg.condition.question,
                            prediction: leg.prediction,
                          });
                        });
                      }}
                    >
                      <SquareStackIcon className="h-4 w-4" />
                      Pick Parlay
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SuggestedBetslips;
