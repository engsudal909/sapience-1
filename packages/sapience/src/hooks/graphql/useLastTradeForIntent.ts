import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export type LastParlayForIntent = {
  mintedAt: number;
  maker: string;
  taker: string;
  makerCollateral?: string | null;
  takerCollateral?: string | null;
  totalCollateral: string;
};

export function useLastTradeForIntent(params: {
  maker?: string | null;
  outcomesSignature?: string | null; // normalized JSON string
  take?: number;
}) {
  const maker = (params.maker || '')?.toLowerCase?.() || '';
  const outcomesSignature = params.outcomesSignature || '';
  const take = params.take ?? 200;
  const enabled = Boolean(maker && outcomesSignature);
  const key = ['lastTrade', 'maker', maker, outcomesSignature] as const;

  const { data, isFetching, refetch } = useQuery<{
    userParlays: Array<{
      mintedAt: number;
      maker: string;
      taker: string;
      makerCollateral?: string | null;
      takerCollateral?: string | null;
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
            maker
            taker
            makerCollateral
            takerCollateral
            totalCollateral
            predictedOutcomes {
              conditionId
              prediction
            }
          }
        }
      `;
      return await graphqlRequest(QUERY, { address: maker, take });
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
