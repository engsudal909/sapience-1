export type NormalizedProbability = {
  probabilityFloat: number | null;
  probabilityD18: string | null;
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) return value;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function normalizePredictionToProbability(
  rawPrediction: string
): NormalizedProbability {
  if (!rawPrediction) return { probabilityFloat: null, probabilityD18: null };

  const trimmed = String(rawPrediction).trim();

  // yes/no strings
  const lower = trimmed.toLowerCase();
  if (lower === 'yes' || lower === 'true') {
    return { probabilityFloat: 1, probabilityD18: '1000000000000000000' };
  }
  if (lower === 'no' || lower === 'false') {
    return { probabilityFloat: 0, probabilityD18: '0' };
  }

  // explicit 0/1
  if (trimmed === '1')
    return { probabilityFloat: 1, probabilityD18: '1000000000000000000' };
  if (trimmed === '0') return { probabilityFloat: 0, probabilityD18: '0' };

  // decimal between 0 and 1
  if (/^0?(\.\d+)?$|^1(\.0+)?$/.test(trimmed)) {
    const p = clamp01(parseFloat(trimmed));
    if (!Number.isFinite(p))
      return { probabilityFloat: null, probabilityD18: null };
    const d18 = BigInt(Math.round(p * 1e18)).toString();
    return { probabilityFloat: p, probabilityD18: d18 };
  }

  // Numeric-only string: treat as D18 integer if value <= 1e18
  if (/^\d+$/.test(trimmed)) {
    try {
      const n = BigInt(trimmed);
      const oneD18 = 10n ** 18n;
      if (n <= oneD18) {
        const p = Number(n) / 1e18;
        if (Number.isFinite(p)) {
          return { probabilityFloat: clamp01(p), probabilityD18: n.toString() };
        }
      }
    } catch {
      // ignore
    }
  }

  return { probabilityFloat: null, probabilityD18: null };
}

export function outcomeFromCondition(condition: {
  settled: boolean;
  resolvedToYes: boolean;
}): 0 | 1 | null {
  if (!condition.settled) {
    return null;
  }
  return condition.resolvedToYes ? 1 : 0;
}
