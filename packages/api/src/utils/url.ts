import { IncomingMessage } from 'node:http';

class ErrorWithCode extends Error {
  code: string;
}

export function parseUrl(input: unknown) {
  if (typeof input !== 'string' || !input) return null;

  try {
    return new URL(input);
  } catch (err: unknown) {
    if ((err as ErrorWithCode).code === 'ERR_INVALID_URL') {
      return null;
    }

    throw err;
  }
}

export function validateOrigin(req: IncomingMessage, allowedOrigins: string[]) {
  const uri = parseUrl(req.headers['origin']);

  if (uri && allowedOrigins.includes(uri.origin)) {
    return true;
  }

  return false;
}
