'use server';

import { NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

type CreateSessionRequest = {
  address: string;
  durationMs: number;
  methods?: string[];
  chainId?: number;
};

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

// In-memory fallback to simulate admin signers when admin credentials are not configured
const inMemorySessions = new Map<
  string,
  { expiry: number; policyId: string }
>();

const SESSION_DEFAULT_DURATION_MS = Number(
  process.env.SESSION_DEFAULT_DURATION_MS || 3600000
);
const SESSION_MAX_DURATION_MS = Number(
  process.env.SESSION_MAX_DURATION_MS || 7 * 24 * 60 * 60 * 1000
);

function parseBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  // Fallback to cookie used elsewhere in app
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
    const body = (await request.json()) as CreateSessionRequest;
    const address = (body?.address || '').toLowerCase();
    const methods = Array.isArray(body?.methods)
      ? body.methods
      : ['eth_sendTransaction'];
    const chainId = typeof body?.chainId === 'number' ? body.chainId : 42161;
    let durationMs = Number(body?.durationMs || SESSION_DEFAULT_DURATION_MS);

    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
    }
    if (!Number.isFinite(durationMs) || durationMs < 60_000) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }
    if (durationMs > SESSION_MAX_DURATION_MS) {
      durationMs = SESSION_MAX_DURATION_MS;
    }

    // Verify caller's Privy access token
    const token = parseBearer(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      await getPrivyClient().verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Single-active invariant: revoke any existing first (best-effort)
    try {
      inMemorySessions.delete(address);
    } catch {
      /* noop */
    }

    const adminKey = process.env.PRIVY_ADMIN_API_KEY;
    const sessionSignerId = process.env.PRIVY_SESSION_SIGNER_ID;
    const hasAdmin = Boolean(adminKey && sessionSignerId);

    const now = Date.now();
    const expiry = now + durationMs;

    if (!hasAdmin) {
      const policyId = `mock-${address}-${expiry}`;
      inMemorySessions.set(address, { expiry, policyId });
      console.log(
        '[session.create] mock mode enabled; created for',
        address,
        'until',
        new Date(expiry).toISOString()
      );
      return NextResponse.json({ policyIds: [policyId], expiry }, { status: 200 });
    }

    // Build policy JSON (DENY by default, ALLOW selected methods until expiry on chain)
    const allowRules = methods.map((m) => ({
      name: `allow-${m}-until-expiry`,
      method: m,
      conditions: [
        {
          field_source: 'system',
          field: 'timestamp_ms',
          operator: 'lte',
          value: expiry,
        },
        {
          field_source: 'ethereum_transaction',
          field: 'chain_id',
          operator: 'eq',
          value: chainId,
        },
      ],
      action: 'ALLOW',
    }));
    const policy = {
      version: '1.0',
      name: `sapience-session-${address}-${new Date(expiry).toISOString()}`,
      chain_type: 'ethereum',
      rules: allowRules,
    };

    // Create policy via Privy Admin REST
    // NOTE: Endpoint subject to Privy Admin API. Adjust path if needed.
    const baseUrl = 'https://api.privy.io/v1';
    const policyResp = await fetch(`${baseUrl}/controls/policies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify(policy),
    });
    if (!policyResp.ok) {
      const txt = await policyResp.text();
      console.warn(
        '[session.create] policy create failed',
        policyResp.status,
        txt
      );
      return NextResponse.json(
        { error: 'policy_create_failed' },
        { status: 500 }
      );
    }
    const policyJson = (await policyResp.json()) as { id?: string };
    const policyId = policyJson?.id || '';
    if (!policyId) {
      return NextResponse.json(
        { error: 'policy_create_missing_id' },
        { status: 500 }
      );
    }

    console.log(
      '[session.create] policy',
      policyId,
      'address',
      address,
      'expiry',
      expiry
    );
    return NextResponse.json({ policyIds: [policyId], expiry }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
