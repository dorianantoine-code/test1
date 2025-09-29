// app/api/ed/qcm/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall } from '../../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,
 *   "cookieHeader"?: string
 * }
 *
 * Requête ED:
 *   POST /v3/connexion/doubleauth.awp?verbe=get&v=...
 *   Headers: X-Token
 *   Body: data={}
 */
export async function POST(req: NextRequest) {
  const { token, cookieHeader } = await req.json();

  if (!token) {
    return NextResponse.json({ ok: false, status: 400, message: 'token requis' }, { status: 400 });
  }

  try {
    const { res, json } = await edCall('/v3/connexion/doubleauth.awp', {
      token,
      verbe: 'get',
      data: {},
      cookieHeader,
    });

    // Petit log serveur pour debug (n'apparaît que côté server)
    console.log('[ED/QCM][start] status', res.status, 'keys', Object.keys(json || {}));

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        data: json,
      },
      { status: res.ok ? 200 : res.status },
    );
  } catch (e: any) {
    console.error('[ED/QCM][start] ERROR', e?.message || e);
    return NextResponse.json(
      { ok: false, status: 500, message: e?.message || 'Erreur interne (start)' },
      { status: 500 },
    );
  }
}
