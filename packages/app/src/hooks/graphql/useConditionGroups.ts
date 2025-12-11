import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

// Extended condition type with fields needed for table aggregates
export interface ConditionGroupConditionType {
  id: string;
  question: string;
  shortName?: string | null;
  endTime: number;
  public: boolean;
  displayOrder?: number | null;
  openInterest: string;
  chainId: number;
  category?: { id: number; name: string; slug: string } | null;
  settled?: boolean;
  resolvedToYes?: boolean;
  claimStatement: string;
  description: string;
}

export interface ConditionGroupType {
  id: number;
  createdAt: string;
  name: string;
  category?: { id: number; name: string; slug: string } | null;
  conditions: ConditionGroupConditionType[];
}

// Filter options for condition groups
export interface ConditionGroupFilters {
  search?: string;
  categorySlugs?: string[];
  publicOnly?: boolean;
}

const GET_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroups(
    $take: Int
    $skip: Int
    $where: ConditionGroupWhereInput
    $conditionsWhere: ConditionWhereInput
  ) {
    conditionGroups(
      orderBy: { createdAt: desc }
      take: $take
      skip: $skip
      where: $where
    ) {
      id
      createdAt
      name
      category {
        id
        name
        slug
      }
      conditions(orderBy: { displayOrder: asc }, where: $conditionsWhere) {
        id
        question
        shortName
        endTime
        public
        displayOrder
        openInterest
        chainId
        settled
        resolvedToYes
        claimStatement
        description
        category {
          id
          name
          slug
        }
      }
    }
  }
`;

function buildGroupWhereClause(
  filters?: ConditionGroupFilters
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  // Search filter - search group name
  if (filters?.search?.trim()) {
    const searchTerm = filters.search.trim();
    andConditions.push({
      name: { contains: searchTerm, mode: 'insensitive' },
    });
  }

  // Category filter by slugs
  if (filters?.categorySlugs && filters.categorySlugs.length > 0) {
    andConditions.push({
      category: {
        is: {
          slug: { in: filters.categorySlugs },
        },
      },
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

function buildConditionsWhereClause(
  chainId?: number,
  publicOnly?: boolean
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  // Chain ID filter for conditions
  if (chainId !== undefined) {
    andConditions.push({ chainId: { equals: chainId } });
  }

  // Public only filter for conditions
  if (publicOnly) {
    andConditions.push({ public: { equals: true } });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  return where;
}

export const useConditionGroups = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}) => {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmptyGroups = opts?.includeEmptyGroups ?? false;

  // Build where clauses
  const groupWhere = buildGroupWhereClause(filters);
  const conditionsWhere = buildConditionsWhereClause(
    chainId,
    filters?.publicOnly
  );

  return useQuery<ConditionGroupType[], Error>({
    queryKey: [
      'conditionGroups',
      take,
      skip,
      chainId,
      filters,
      includeEmptyGroups,
    ],
    queryFn: async (): Promise<ConditionGroupType[]> => {
      type ConditionGroupsQueryResult = {
        conditionGroups: ConditionGroupType[];
      };
      const variables = {
        take,
        skip,
        where: Object.keys(groupWhere).length > 0 ? groupWhere : undefined,
        conditionsWhere:
          Object.keys(conditionsWhere).length > 0 ? conditionsWhere : undefined,
      };

      const data = await graphqlRequest<ConditionGroupsQueryResult>(
        GET_CONDITION_GROUPS,
        variables
      );

      const groups = data.conditionGroups ?? [];
      // Default behavior (used by Markets): drop groups that end up with zero
      // conditions after filtering. Admin needs to see empty groups too.
      return includeEmptyGroups
        ? groups
        : groups.filter((g) => g.conditions.length > 0);
    },
  });
};
