// Keyword → SVG filename manifest for market badges.
// To add a new badge:
// 1) Drop an SVG file into `public/market-badges/` (e.g., `chicago-bulls.svg`).
// 2) Add one or more keywords here that should map to that file.

export const BADGE_ICON_BY_KEYWORD: Record<string, string> = {
  // Cities
  london: 'london.svg',
  nyc: 'nyc.svg',
  'new-york': 'nyc.svg',
  // Teams / examples
  giants: 'giants.svg',
};

function toTokens(label: string): string[] {
  const lower = label.toLowerCase();
  // Replace all non-alphanumeric with spaces, collapse, and split
  const base = lower.replace(/[^a-z0-9]+/g, ' ').trim();
  if (!base) return [];
  const words = base.split(/\s+/);
  // Also include common bigrams joined with hyphen to match manifest keys like 'new-york'
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]}-${words[i + 1]}`);
  }
  return Array.from(new Set([...bigrams, ...words]));
}

export function findBadgeForLabel(label: string): string | null {
  const tokens = toTokens(label);
  for (const token of tokens) {
    const filename = BADGE_ICON_BY_KEYWORD[token];
    if (filename) return filename;
  }
  return null;
}


