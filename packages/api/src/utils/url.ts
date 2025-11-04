import { IncomingMessage } from 'node:http';

export function parseUrl(input: any) {
  if (typeof input !== 'string' || !input) return null;

  try {
    return new URL(input);
  } catch (err: any) {
    if (err.code === 'ERR_INVALID_URL') {
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
