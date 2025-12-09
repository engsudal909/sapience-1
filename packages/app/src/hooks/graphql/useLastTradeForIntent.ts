import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export type LastParlayForIntent = {
  mintedAt: number;
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
};

export function useLastTradeForIntent(params: {
  predictor?: string | null;
  outcomesSignature?: string | null; // normalized JSON string
  take?: number;
}) {
  const predictor = (params.predictor || '')?.toLowerCase?.() || '';
  const outcomesSignature = params.outcomesSignature || '';
  const take = params.take ?? 200;
  const enabled = Boolean(predictor && outcomesSignature);
  const key = ['lastTrade', 'predictor', predictor, outcomesSignature] as const;

  const { data, isFetching, refetch } = useQuery<{
    userParlays: Array<{
      mintedAt: number;
      predictor: string;
      counterparty: string;
      predictorCollateral?: string | null;
      counterpartyCollateral?: string | null;
      totalCollateral: string;
      predictedOutcomes: Array<{ conditionId: string; prediction: boolean }>;
    }>;
  }>({
    queryKey: key,
    enabled,
    staleTime: 15_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const QUERY = /* GraphQL */ `
        query UserParlaysForLastTrade($address: String!, $take: Int) {
          userParlays(address: $address, take: $take) {
            mintedAt
            predictor
            counterparty
            predictorCollateral
            counterpartyCollateral
            totalCollateral
            predictedOutcomes {
              conditionId
              prediction
            }
          }
        }
      `;
      return await graphqlRequest(QUERY, { address: predictor, take });
    },
    select: (resp) => {
      const list = resp?.userParlays || [];
      // Normalize each parlay outcomes and compare to signature
      const target = outcomesSignature;
      const normalize = (
        arr: Array<{ conditionId: string; prediction: boolean }>
      ) =>
        JSON.stringify(
          (arr || [])
            .map((o) => ({
              conditionId: String(o.conditionId).toLowerCase(),
              prediction: !!o.prediction,
            }))
            .sort((a, b) =>
              a.conditionId === b.conditionId
                ? Number(a.prediction) - Number(b.prediction)
                : a.conditionId.localeCompare(b.conditionId)
            )
        );
      const match =
        list.find((p) => normalize(p.predictedOutcomes) === target) || null;
      return { last: match } as { last: LastParlayForIntent | null } as any;
    },
  });

  return { data: (data as any)?.last ?? null, isFetching, refetch };
}
