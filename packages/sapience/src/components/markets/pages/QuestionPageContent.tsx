'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import dynamic from 'next/dynamic';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Badge } from '@sapience/sdk/ui/components/ui/badge';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { DollarSign, ExternalLink } from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
} from '@sapience/sdk/contracts/addresses';
import { motion, AnimatePresence } from 'framer-motion';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import SafeMarkdown from '~/components/shared/SafeMarkdown';
import Comments, { CommentFilters } from '~/components/shared/Comments';
import ConditionForecastForm from '~/components/conditions/ConditionForecastForm';

// Placeholder data for the scatterplot
const placeholderData = [
  { x: 10, y: 30 },
  { x: 20, y: 50 },
  { x: 30, y: 35 },
  { x: 40, y: 70 },
  { x: 50, y: 45 },
  { x: 60, y: 60 },
  { x: 70, y: 55 },
  { x: 80, y: 80 },
  { x: 90, y: 65 },
  { x: 100, y: 75 },
];

const LottieLoader = dynamic(() => import('~/components/shared/LottieLoader'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" />,
});

interface QuestionPageContentProps {
  conditionId: string;
}

export default function QuestionPageContent({
  conditionId,
}: QuestionPageContentProps) {
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);

  const { data, isLoading, isError } = useQuery<
    {
      id: string;
      question: string;
      shortName?: string | null;
      endTime?: number | null;
      description?: string | null;
      category?: { slug: string } | null;
      chainId?: number | null;
    } | null,
    Error
  >({
    queryKey: ['conditionById', conditionId],
    enabled: Boolean(conditionId),
    queryFn: async () => {
      if (!conditionId) return null;
      const QUERY = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1) {
            id
            question
            shortName
            endTime
            description
            chainId
            category {
              slug
            }
          }
        }
      `;
      const resp = await graphqlRequest<{
        conditions: Array<{
          id: string;
          question: string;
          shortName?: string | null;
          endTime?: number | null;
          description?: string | null;
          category?: { slug: string } | null;
          chainId?: number | null;
        }>;
      }>(QUERY, { ids: [conditionId] });
      return resp?.conditions?.[0] || null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const [isDescriptionExpanded, setIsDescriptionExpanded] =
    React.useState(false);
  const [wagerAmount, setWagerAmount] = React.useState('1');

  const handleForecastSuccess = React.useCallback(() => {
    setRefetchTrigger((prev) => prev + 1);
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[100dvh] w-full">
        <LottieLoader width={32} height={32} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] w-full gap-4">
        <p className="text-destructive">Failed to load question.</p>
      </div>
    );
  }

  const displayTitle = data.question || data.shortName || '';

  return (
    <div className="flex flex-col w-full min-h-[100dvh] pt-16">
      <div className="flex flex-col w-full px-4 md:px-6 lg:px-8 items-center">
        {/* Main content */}
        <div className="w-full max-w-[600px] mt-8 md:mt-16">
          {/* Title */}
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-normal text-foreground mb-6 break-words">
            {displayTitle}
          </h1>

          {/* Placeholder Scatterplot */}
          <div className="w-full h-[300px] mb-8 bg-brand-black">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--brand-white) / 0.1)"
                />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="X"
                  tick={{ fill: 'hsl(var(--brand-white))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Y"
                  tick={{ fill: 'hsl(var(--brand-white))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                  tickLine={{ stroke: 'hsl(var(--brand-white) / 0.3)' }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--brand-black))',
                    border: '1px solid hsl(var(--brand-white) / 0.2)',
                    borderRadius: '4px',
                    color: 'hsl(var(--brand-white))',
                  }}
                  labelStyle={{ color: 'hsl(var(--brand-white))' }}
                />
                <Scatter
                  name="Data"
                  data={placeholderData}
                  fill="hsl(var(--brand-purple))"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Open Interest & End time badges */}
          <div className="flex flex-wrap gap-3 mb-8">
            {/* Open Interest Badge */}
            {(() => {
              const isPastEndTime =
                typeof data.endTime === 'number' &&
                data.endTime > 0 &&
                Date.now() / 1000 >= data.endTime;
              return (
                <Badge
                  variant="outline"
                  className="h-9 items-center px-3.5 text-sm leading-none inline-flex bg-card border-brand-white/20 text-brand-white"
                >
                  <DollarSign className="h-4 w-4 mr-1 -mt-0.5" />
                  {isPastEndTime ? 'Peak Open Interest' : 'Open Interest'}
                  <span
                    aria-hidden="true"
                    className="hidden md:inline-block mx-2.5 h-4 w-px bg-muted-foreground/30"
                  />
                  <span className="whitespace-nowrap text-muted-foreground font-normal">
                    — USDe
                  </span>
                </Badge>
              );
            })()}

            {/* End Time Badge */}
            <EndTimeDisplay
              endTime={data.endTime ?? null}
              size="large"
              appearance="brandWhite"
            />
          </div>

          {/* Make a Prediction */}
          <div className="mb-8">
            <h2 className="sc-heading text-foreground mb-2">
              Make a Prediction
            </h2>
            <div className="border border-border rounded-lg bg-brand-black p-4">
              <div className="flex items-center gap-4">
                {/* Wager Form */}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Wager</span>
                  <Input
                    type="number"
                    value={wagerAmount}
                    onChange={(e) => setWagerAmount(e.target.value)}
                    className="w-20 h-8 text-center font-mono"
                    min="0"
                    step="0.1"
                  />
                  <span className="text-muted-foreground">USDe</span>
                  <span className="text-muted-foreground">to win</span>
                  <span className="font-mono text-brand-white">
                    {(parseFloat(wagerAmount) * 2 || 0).toFixed(2)} USDe
                  </span>
                </div>

                {/* Submit Button */}
                <Button variant="default" size="sm">
                  Submit Prediction
                </Button>

                {/* Vertical Separator */}
                <div className="h-16 w-px bg-muted-foreground/30" />

                {/* Implied Probability Display - pushed to right */}
                <div className="flex flex-col items-end w-[150px] ml-auto text-right">
                  <span className="font-mono text-ethena text-xl">
                    50% chance
                  </span>
                  <span className="text-muted-foreground text-xs">
                    implied probability
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="mb-8">
            <h2 className="sc-heading text-foreground mb-2">Transactions</h2>
            <div className="border border-border rounded-lg bg-brand-black p-4">
              <span className="text-muted-foreground text-sm">Coming soon</span>
            </div>
          </div>

          {/* Resolution Criteria */}
          {data.description ? (
            <div className="mb-8">
              <h2 className="sc-heading text-foreground mb-2">
                Resolution Criteria
              </h2>
              <div className="border border-border rounded-lg bg-brand-black p-4">
                <div className="relative overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      height: isDescriptionExpanded ? 'auto' : '4.5em',
                    }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className="text-lg leading-relaxed break-words [&_a]:break-all text-brand-white/90"
                  >
                    <SafeMarkdown
                      content={data.description}
                      className="break-words [&_a]:break-all prose prose-invert prose-lg max-w-none"
                    />
                  </motion.div>
                  <AnimatePresence>
                    {!isDescriptionExpanded && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-brand-black to-transparent pointer-events-none"
                      />
                    )}
                  </AnimatePresence>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="mt-2 text-sm font-medium gold-link"
                >
                  {isDescriptionExpanded ? 'Show less' : 'Read more'}
                </button>
              </div>
            </div>
          ) : null}

          {/* Smart Contract Info Table */}
          <div className="mt-8 mb-8">
            <h2 className="sc-heading text-foreground mb-2">
              Smart Contract Info
            </h2>
            <div className="border border-border rounded-lg bg-brand-black overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Prediction Market
                    </td>
                    <td className="px-4 py-3 text-brand-white font-mono text-xs break-all">
                      {(() => {
                        const chainId = data.chainId ?? 42161;
                        const address = predictionMarket[chainId]?.address;
                        if (!address) return '—';
                        return (
                          <a
                            href={`https://arbiscan.io/address/${address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 hover:text-accent-gold transition-colors"
                          >
                            {address}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        );
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Resolver
                    </td>
                    <td className="px-4 py-3 text-brand-white font-mono text-xs break-all">
                      {(() => {
                        const chainId = data.chainId ?? 42161;
                        const address = umaResolver[chainId]?.address;
                        if (!address) return '—';
                        return (
                          <a
                            href={`https://arbiscan.io/address/${address}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 hover:text-accent-gold transition-colors"
                          >
                            {address}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        );
                      })()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-muted-foreground font-medium whitespace-nowrap">
                      Condition ID
                    </td>
                    <td className="px-4 py-3 text-brand-white font-mono text-xs break-all">
                      {conditionId}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Forecasts Section */}
          <div className="mt-8 mb-12">
            <h2 className="sc-heading text-foreground mb-2">Forecasts</h2>
            <div className="border border-border rounded-lg bg-brand-black overflow-hidden">
              <div className="p-4">
                <ConditionForecastForm
                  conditionId={conditionId}
                  question={data.shortName || data.question || ''}
                  endTime={data.endTime ?? undefined}
                  categorySlug={data.category?.slug}
                  onSuccess={handleForecastSuccess}
                />
              </div>
              <Comments
                selectedCategory={CommentFilters.SelectedQuestion}
                question={data.shortName || data.question}
                refetchTrigger={refetchTrigger}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
