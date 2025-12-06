/**
 * Utility functions for converting between tick values and readable price values
 */

/**
 * Converts a tick value to a price
 * @param tick The tick value to convert
 * @param tickSpacing Optional tick spacing to round to
 * @returns The price represented by the tick
 */
export const tickToPrice = (
  tick: number,
  tickSpacing: number = 200
): number => {
  // If tickSpacing is provided, round the tick to the nearest valid tick
  const roundedTick = tickSpacing
    ? Math.round(tick / tickSpacing) * tickSpacing
    : tick;
  // Use the standard formula: price = 1.0001^tick
  return 1.0001 ** roundedTick;
};
