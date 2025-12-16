/**
 * Utility functions for converting between tick values and readable price values.
 *
 * Convention: price = 1.0001^tick (Uniswap v3-style tick math).
 */

/**
 * Converts a tick value to a price.
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

/**
 * Converts a price to a tick.
 * @param price The price to convert
 * @param tickSpacing Optional tick spacing to round to
 * @returns The tick represented by the price (rounded to spacing if provided)
 */
export const priceToTick = (
  price: number,
  tickSpacing: number = 200
): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;

  const rawTick = Math.log(price) / Math.log(1.0001);
  const tick = Math.round(rawTick);
  return tickSpacing ? Math.round(tick / tickSpacing) * tickSpacing : tick;
};
