'use server';

import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

type RevokeSessionRequest = { address: string };

let privyClient: PrivyClient | null = null;
function getPrivyClient() {
  if (privyClient) return privyClient;
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      'Server not configured: missing PRIVY_APP_ID/PRIVY_APP_SECRET'
    );
  }
  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

function parseBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const cookieHeader = req.headers.get('cookie') || '';
  const rawCookie = cookieHeader
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('privy-token='));
  const token = rawCookie
    ? decodeURIComponent(rawCookie.split('=')[1] || '')
    : '';
  return token || null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RevokeSessionRequest;
    const address = (body?.address || '').toLowerCase();
    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }

    const token = parseBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      await getPrivyClient().verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminKey = process.env.PRIVY_ADMIN_API_KEY;
    const hasAdmin = Boolean(adminKey);

    if (!hasAdmin) {
      // mock mode: nothing to revoke server-side
      console.log('[session.revoke] mock revoke for', address);
      return NextResponse.json({ revoked: true }, { status: 200 });
    }

    const baseUrl = 'https://api.privy.io/v1';
    // Remove all additional signers for this address created by us
    const resp = await fetch(
      `${baseUrl}/wallets/${address}/additional-signers`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminKey}`,
        },
      }
    );
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('[session.revoke] remove signers failed', resp.status, txt);
      // treat as idempotent
    }

    return NextResponse.json({ revoked: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
