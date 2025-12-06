// app/api/ed/qcm/start/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall } from '../../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,
 *   "gtk"?: string,
 *   "cookieHeader"?: string
 * }
 *
 * Requête ED:
 *   POST /v3/connexion/doubleauth.awp?verbe=get&v=...
 *   Headers: X-Token
 *   Body: data={}
 */
export async function POST(req: NextRequest) {
  const { token, cookieHeader, gtk } = await req.json();

  if (!token) {
    return NextResponse.json({ ok: false, status: 400, message: 'token requis' }, { status: 400 });
  }

  try {
    console.log('[ED/QCM][start] input', {
      hasToken: !!token,
      tokenPrefix: String(token).slice(0, 8),
      tokenLen: String(token).length,
      hasCookie: !!cookieHeader,
      cookieLen: cookieHeader ? cookieHeader.length : 0,
      hasGtk: !!gtk,
      gtkLen: gtk ? gtk.length : 0,
      cookiePreview: cookieHeader ? String(cookieHeader).slice(0, 80) : null,
    });

    const { res, json } = await edCall('/v3/connexion/doubleauth.awp', {
      token,
      verbe: 'get',
      data: {},
      cookieHeader,
    });

    console.log('[ED/QCM][start] output', {
      httpStatus: res.status,
      ok: res.ok,
      keys: Object.keys(json || {}),
      code: json?.code,
      token: json?.token,
      message: json?.message,
      hasData: !!json?.data,
      nestedKeys: json?.data ? Object.keys(json.data) : [],
    });

    return NextResponse.json(
      {
        ok: res.ok,
        status: res.status,
        data: json,
        debug: {
          sent: {
            tokenPrefix: String(token).slice(0, 8),
            tokenLen: String(token).length,
            cookieLen: cookieHeader ? cookieHeader.length : 0,
            cookiePreview: cookieHeader ? String(cookieHeader).slice(0, 120) : null,
          },
          received: {
            code: json?.code,
            token: json?.token ? String(json.token).slice(0, 8) : null,
            message: json?.message,
            httpStatus: res.status,
            ok: res.ok,
            dataKeys: json?.data ? Object.keys(json.data) : [],
          },
        },
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
