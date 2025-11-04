import { makeValidator } from 'envalid';

export const originsArray = makeValidator((input) => {
  if (typeof input !== 'string' || !input) {
    return [] as string[];
  }

  const values = String(input)
    .split(',')
    .map((val) => new URL(val).origin)
    .filter(Boolean);

  return values;
});
