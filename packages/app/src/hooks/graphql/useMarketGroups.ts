import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { QueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type {
  Market as MarketType,
  MarketGroup as MarketGroupType,
  Category as CategoryType,
} from '@sapience/sdk/types/graphql';

import { getFocusAreaMap } from '~/lib/constants/focusAreas';
import type { MarketGroupClassification } from '~/lib/types';
import { getMarketGroupClassification } from '~/lib/utils/marketUtils';

// GraphQL query to fetch categories
const GET_CATEGORIES = /* GraphQL */ `
  query Categories {
    categories {
      id
      name
      slug
      marketGroups {
        id
      }
    }
  }
`;

// Custom hook to fetch categories using Tanstack Query
export const useCategories = () => {
  return useQuery<CategoryType[], Error>({
    queryKey: ['categories'],
    queryFn: async (): Promise<CategoryType[]> => {
      try {
        type CategoriesQueryResult = {
          categories: CategoryType[];
        };

        const data =
          await graphqlRequest<CategoriesQueryResult>(GET_CATEGORIES);

        if (!data || !Array.isArray(data.categories)) {
          console.error(
            'Unexpected API response structure for categories:',
            data
          );
          throw new Error(
            'Failed to fetch categories: Invalid response structure'
          );
        }

        return data.categories;
      } catch (err) {
        console.error('Error fetching categories:', err);
        throw err instanceof Error
          ? err
          : new Error('An unknown error occurred while fetching categories');
      }
    },
  });
};

// (Conditions hook moved to hooks/graphql/useConditions.ts)

export interface EnrichedMarketGroup
  extends Omit<MarketGroupType, 'category' | 'markets'> {
  category: CategoryType & { color?: string };
  markets: MarketType[];
  latestMarketId?: bigint;
  marketClassification: MarketGroupClassification;
}

const MARKETS_QUERY = /* GraphQL */ `
  query Markets {
    marketGroups {
      id
      address
      chainId
      owner
      collateralAsset
      question
      rules
      baseTokenName
      quoteTokenName
      factoryAddress
      initializationNonce
      minTradeSize
      collateralDecimals
      collateralSymbol
      deployTimestamp
      deployTxnBlockNumber
      isCumulative
      isBridged
      resource {
        id
        name
        slug
      }
      marketParamsFeerate
      marketParamsAssertionliveness
      marketParamsBondcurrency
      marketParamsBondamount
      marketParamsUniswappositionmanager
      marketParamsUniswapswaprouter
      marketParamsUniswapquoter
      marketParamsOptimisticoraclev3
      category {
        id
        name
        slug
      }
      markets {
        id
        marketId
        startTimestamp
        endTimestamp
        settled
        public
        question
        shortName
        poolAddress
        settlementPriceD18
        optionName
        baseAssetMinPriceTick
        baseAssetMaxPriceTick
        startingSqrtPriceX96
        marketParamsFeerate
        marketParamsAssertionliveness
        marketParamsBondcurrency
        marketParamsBondamount
        claimStatementYesOrNumeric
        claimStatementNo
        marketParamsUniswappositionmanager
        marketParamsUniswapswaprouter
        marketParamsUniswapquoter
        marketParamsOptimisticoraclev3
      }
    }
  }
`;

const getEnrichedMarketGroups = async () => {
  // Create a lookup map for focus areas using their ID (which matches category slug)
  const focusAreaMap = getFocusAreaMap();

  // --- Fetch initial market group data ---
  type MarketGroupsQueryResult = {
    marketGroups: MarketGroupType[];
  };

  const data = await graphqlRequest<MarketGroupsQueryResult>(MARKETS_QUERY);

  if (!data || !data.marketGroups) {
    console.error(
      '[useEnrichedMarketGroups] No market groups data received from API or data structure invalid.'
    );
    return [];
  }

  // --- Process market groups (enrichment only) ---
  return data.marketGroups.map(
    (marketGroup: MarketGroupType): EnrichedMarketGroup => {
      const focusAreaData = focusAreaMap.get(marketGroup?.category?.slug || '');

      let categoryInfo: CategoryType & { color?: string };
      if (marketGroup.category && focusAreaData) {
        categoryInfo = {
          ...marketGroup.category,
          marketGroups: marketGroup.category.marketGroups,
          color: focusAreaData?.color || 'hsl(var(--muted-foreground))',
        };
      } else {
        categoryInfo = {
          id: -1,
          name: 'Unknown',
          slug: 'unknown',
          createdAt: new Date().toISOString(),
          resources: [],
          marketGroups: [],
          conditions: [],
          color: 'hsl(var(--muted-foreground))',
        } as unknown as CategoryType & { color?: string };
      }

      const mappedMarkets = (marketGroup.markets || []).map(
        (market: MarketType): MarketType => ({
          ...market,
          id: market.id,
          positions: market.positions || [],
        })
      );

      // Get classification
      const classification = getMarketGroupClassification(marketGroup);

      // Return the enriched group WITHOUT fetching marketId here
      return {
        ...marketGroup,
        category: categoryInfo,
        markets: mappedMarkets,
        marketClassification: classification,
      };
    }
  );
};

export const prefetchEnrichedMarketGroups = async (
  queryClient: QueryClient
) => {
  return await queryClient.prefetchQuery({
    queryKey: ['enrichedMarketGroups'],
    queryFn: getEnrichedMarketGroups,
  });
};
