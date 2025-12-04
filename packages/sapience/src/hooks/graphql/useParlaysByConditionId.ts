import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { Parlay } from './useUserParlays';

const PARLAYS_BY_CONDITION_ID_QUERY = /* GraphQL */ `
  query ParlaysByConditionId(
    $conditionId: String!
    $take: Int
    $skip: Int
    $chainId: Int
  ) {
    parlaysByConditionId(
      conditionId: $conditionId
      take: $take
      skip: $skip
      chainId: $chainId
    ) {
      id
      chainId
      marketAddress
      maker
      taker
      makerNftTokenId
      takerNftTokenId
      totalCollateral
      makerCollateral
      takerCollateral
      refCode
      status
      makerWon
      mintedAt
      settledAt
      endsAt
      predictedOutcomes {
        conditionId
        prediction
        condition {
          id
          question
          shortName
          endTime
        }
      }
    }
  }
`;

export function useParlaysByConditionId(params: {
  conditionId?: string;
  take?: number;
  skip?: number;
  chainId?: number;
  options?: {
    enabled?: boolean;
    staleTime?: number;
    refetchOnWindowFocus?: boolean;
    refetchOnReconnect?: boolean;
  };
}) {
  const { conditionId, take = 100, skip = 0, chainId, options } = params;
  const enabled = options?.enabled ?? Boolean(conditionId);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['parlaysByConditionId', conditionId, take, skip, chainId],
    enabled,
    staleTime: options?.staleTime ?? 30_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchOnReconnect: options?.refetchOnReconnect ?? false,
    queryFn: async () => {
      if (!conditionId) return [];

      const resp = await graphqlRequest<{ parlaysByConditionId: Parlay[] }>(
        PARLAYS_BY_CONDITION_ID_QUERY,
        {
          conditionId,
          take,
          skip,
          chainId: chainId ?? null,
        }
      );
      const base = resp?.parlaysByConditionId ?? [];

      // Collect unique condition IDs to fetch shortNames, descriptions, and categories in a secondary query
      const conditionIds = Array.from(
        new Set(
          base.flatMap((p) =>
            (p.predictedOutcomes || []).map((o) => o.conditionId)
          )
        )
      );

      if (conditionIds.length === 0) return base;

      // Fetch shortName, description, category values for these condition IDs and join client-side
      const CONDITIONS_BY_IDS = /* GraphQL */ `
        query ConditionsByIds($ids: [String!]!) {
          conditions(where: { id: { in: $ids } }, take: 1000) {
            id
            shortName
            description
            category {
              slug
            }
          }
        }
      `;

      type CondRow = {
        id: string;
        shortName?: string | null;
        description?: string | null;
        category?: { slug: string } | null;
      };
      const condResp = await graphqlRequest<{ conditions: CondRow[] }>(
        CONDITIONS_BY_IDS,
        { ids: conditionIds }
      );
      const conditionDataMap = new Map(
        (condResp?.conditions || []).map((c) => [c.id, c])
      );

      // Enrich predictedOutcomes.condition with shortName, description, category if available
      return base.map((p) => ({
        ...p,
        predictedOutcomes: (p.predictedOutcomes || []).map((o) => {
          const condData = conditionDataMap.get(o.conditionId);
          if (!condData) return o;
          return {
            ...o,
            condition: o.condition
              ? {
                  ...o.condition,
                  shortName: condData.shortName ?? o.condition.shortName,
                  description: condData.description ?? o.condition.description,
                  category: condData.category ?? o.condition.category,
                }
              : undefined,
          };
        }),
      }));
    },
  });

  return {
    data: data ?? [],
    isLoading: !!enabled && (isLoading || isFetching),
    error,
  };
}
