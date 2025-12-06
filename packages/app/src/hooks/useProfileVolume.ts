'use client';

import * as React from 'react';
import type { Parlay } from '~/hooks/graphql/useUserParlays';
import { formatUnits } from 'viem';
import { formatFiveSigFigs } from '~/lib/utils/util';

export function useProfileVolume(
  parlays: Parlay[] | undefined,
  address?: string
) {
  return React.useMemo(() => {
    try {
      let total = 0;
      const viewer = String(address || '').toLowerCase();

      for (const parlay of parlays || []) {
        try {
          const makerIsUser =
            typeof parlay.maker === 'string' &&
            parlay.maker.toLowerCase() === viewer;
          const takerIsUser =
            typeof parlay.taker === 'string' &&
            parlay.taker.toLowerCase() === viewer;
          if (makerIsUser && parlay.makerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.makerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
          if (takerIsUser && parlay.takerCollateral) {
            const human = Number(
              formatUnits(BigInt(parlay.takerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
        } catch {
          // ignore
        }
      }

      const value = total;
      return { value, display: formatFiveSigFigs(value) };
    } catch {
      return { value: 0, display: '0' };
    }
  }, [parlays, address]);
}
