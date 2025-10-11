export const runtime = 'edge';

import { NextResponse } from 'next/server';

type StatusResponse = { active: boolean; expiry?: number };

// Lightweight in-memory cache scoped to the Edge runtime instance.
// For production, rely on admin API lookup; here we keep a per-instance map as best-effort.
const memory = new Map<string, { expiry: number }>();

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const address = (url.searchParams.get('address') || '').toLowerCase();
    if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
      return NextResponse.json({ active: false } satisfies StatusResponse, {
        status: 200,
      });
    }

    const now = Date.now();
    const cached = memory.get(address);
    if (cached && cached.expiry > now) {
      return NextResponse.json(
        { active: true, expiry: cached.expiry } as StatusResponse,
        { status: 200 }
      );
    }

    // If we had admin credentials, we could query additional signers and policies here.
    // For now, report inactive when not cached or expired; callers will recreate as needed.
    if (cached && cached.expiry <= now) {
      memory.delete(address);
    }
    return NextResponse.json({ active: false } as StatusResponse, {
      status: 200,
    });
  } catch (_err) {
    return NextResponse.json({ active: false } as StatusResponse, {
      status: 200,
    });
  }
}

// Internal helper for the create route (same runtime may share memory)
function __setSession(address: string, expiry: number) {
  memory.set(address.toLowerCase(), { expiry });
}
