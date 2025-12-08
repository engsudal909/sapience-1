'use client';

import * as React from 'react';
import type { Parlay } from '~/hooks/graphql/useUserParlays';
import { formatUnits } from 'viem';
import { formatFiveSigFigs } from '~/lib/utils/util';

export function useProfileVolume(
  positions: Parlay[] | undefined,
  address?: string
) {
  return React.useMemo(() => {
    try {
      let total = 0;
      const viewer = String(address || '').toLowerCase();

      for (const position of positions || []) {
        try {
          const makerIsUser =
            typeof position.maker === 'string' &&
            position.maker.toLowerCase() === viewer;
          const takerIsUser =
            typeof position.taker === 'string' &&
            position.taker.toLowerCase() === viewer;
          if (makerIsUser && position.makerCollateral) {
            const human = Number(
              formatUnits(BigInt(position.makerCollateral), 18)
            );
            if (Number.isFinite(human)) total += human;
          }
          if (takerIsUser && position.takerCollateral) {
            const human = Number(
              formatUnits(BigInt(position.takerCollateral), 18)
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
  }, [positions, address]);
}
