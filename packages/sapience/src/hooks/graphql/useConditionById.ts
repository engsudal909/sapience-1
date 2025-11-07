import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

export interface ConditionByIdType {
  id: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
}

const GET_CONDITION_BY_ID = /* GraphQL */ `
  query ConditionById($id: String!) {
    conditions(where: { id: { equals: $id } }, take: 1) {
      id
      question
      shortName
      endTime
      public
    }
  }
`;

export const useConditionById = (id?: string | null) => {
  return useQuery<ConditionByIdType | null>({
    queryKey: ['conditionById', id || null],
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) return null;
      type Result = { conditions: ConditionByIdType[] };
      const data = await graphqlRequest<Result>(GET_CONDITION_BY_ID, { id });
      const first = data.conditions?.[0] || null;
      return first;
    },
  });
};
