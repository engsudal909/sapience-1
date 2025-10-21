'use client';

import * as React from 'react';
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import EndTimeDisplay from '~/components/shared/EndTimeDisplay';
import SafeMarkdown from '~/components/shared/SafeMarkdown';

export interface ConditionDialogProps {
  conditionId?: string;
  title?: string;
  endTime?: number | null;
  description?: string | null;
  className?: string;
}

export default function ConditionDialog({
  conditionId,
  title,
  endTime,
  description,
  className,
}: ConditionDialogProps) {
  const shouldFetch = Boolean(conditionId);

  const { data: fetched } = useQuery<
    {
      id: string;
      question: string;
      shortName?: string | null;
      endTime?: number | null;
      description?: string | null;
    } | null,
    Error
  >({
    queryKey: ['conditionById', conditionId],
    enabled: shouldFetch,
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
        }>;
      }>(QUERY, { ids: [conditionId] });
      return resp?.conditions?.[0] || null;
    },
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const displayTitle = React.useMemo(() => {
    if (title && title.trim().length > 0) return title;
    return fetched?.shortName || fetched?.question || '';
  }, [title, fetched?.shortName, fetched?.question]);

  const displayEndTime =
    typeof endTime === 'number' || endTime === null
      ? endTime
      : (fetched?.endTime ?? null);
  const displayDescription =
    typeof description === 'string'
      ? description
      : (fetched?.description ?? null);

  return (
    <DialogContent
      className={`w-[92vw] max-w-3xl break-words overflow-x-hidden ${className ?? ''}`}
    >
      <DialogHeader>
        <DialogTitle className="break-words whitespace-normal text-2xl font-medium">
          {displayTitle}
        </DialogTitle>
      </DialogHeader>
      <div>
        <div className="flex items-center mb-4">
          <EndTimeDisplay endTime={displayEndTime} size="large" />
        </div>
        {displayDescription ? (
          <div className="text-sm leading-relaxed break-words [&_a]:break-all">
            <SafeMarkdown
              content={displayDescription}
              className="break-words [&_a]:break-all"
            />
          </div>
        ) : null}
      </div>
    </DialogContent>
  );
}
