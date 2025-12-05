export type TableViewContext =
  | 'profile'
  | 'market_page'
  | 'market_group'
  | 'data_drawer'
  | 'user_positions';

export interface MarketContext {
  address?: string;
  chainId?: number;
  marketId?: number;
}

export interface ColumnOverrides {
  position?: boolean | 'auto';
  owner?: boolean;
  actions?: boolean;
}

export interface ResolveVisibilityParams {
  context?: TableViewContext;
  marketContext?: MarketContext;
  hasMultipleMarkets: boolean;
  overrides?: ColumnOverrides;
}

export interface ResolvedVisibility {
  showPosition: boolean;
  showOwner: boolean;
  showActions: boolean;
}

export function resolvePositionsTableVisibility(
  params: ResolveVisibilityParams
): ResolvedVisibility {
  const { context, marketContext, hasMultipleMarkets, overrides } = params;

  const isMarketPage = Boolean(
    marketContext?.address && marketContext?.chainId && marketContext?.marketId
  );

  // Context defaults (match existing behavior)
  const defaultsByContext: Record<
    NonNullable<TableViewContext>,
    ResolvedVisibility
  > = {
    profile: { showPosition: true, showOwner: false, showActions: true },
    market_page: { showPosition: false, showOwner: false, showActions: true },
    market_group: {
      showPosition: hasMultipleMarkets,
      showOwner: false,
      showActions: true,
    },
    data_drawer: { showPosition: true, showOwner: true, showActions: false },
    user_positions: {
      showPosition: hasMultipleMarkets,
      showOwner: false,
      showActions: true,
    },
  };

  const base: ResolvedVisibility = context
    ? defaultsByContext[context]
    : // Fallback: infer from market page boolean if no explicit context
      isMarketPage
      ? { showPosition: false, showOwner: false, showActions: true }
      : {
          showPosition: hasMultipleMarkets,
          showOwner: false,
          showActions: true,
        };

  // Apply overrides if provided
  let showPosition = base.showPosition;
  if (overrides && overrides.position !== undefined) {
    if (overrides.position === 'auto') {
      showPosition = base.showPosition;
    } else {
      showPosition = Boolean(overrides.position);
    }
  }
  const showOwner =
    overrides?.owner !== undefined ? Boolean(overrides.owner) : base.showOwner;
  const showActions =
    overrides?.actions !== undefined
      ? Boolean(overrides.actions)
      : base.showActions;

  return { showPosition, showOwner, showActions };
}
