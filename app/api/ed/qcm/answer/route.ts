// app/api/ed/qcm/answer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall } from '../../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,
 *   "choix": string,          // souvent base64 fourni par /start
 *   "gtk"?: string,
 *   "cookieHeader"?: string
 * }
 *
 * Requête ED:
 *   POST /v3/connexion/doubleauth.awp?verbe=post&v=...
 *   Body: data={ "choix": "<base64>" }
 *
 * Réponse possible:
 *   - code=200 et données permettant un relogin (ex: { cn, cv }) -> il faut relancer /login avec fa: [{cn, cv}]
 *   - ou parfois directement un token utilisable
 */
export async function POST(req: NextRequest) {
  const { token, choix, cookieHeader, gtk } = await req.json();

  if (!token || !choix) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'token et choix sont requis' },
      { status: 400 },
    );
  }

  console.log('[ED/QCM][answer] input', {
    hasToken: !!token,
    tokenPrefix: String(token).slice(0, 8),
    tokenLen: String(token).length,
    hasChoix: !!choix,
    choixLen: String(choix).length,
    hasCookie: !!cookieHeader,
    cookieLen: cookieHeader ? cookieHeader.length : 0,
    hasGtk: !!gtk,
    gtkLen: gtk ? gtk.length : 0,
    cookiePreview: cookieHeader ? String(cookieHeader).slice(0, 80) : null,
  });

  const { res, json } = await edCall('/v3/connexion/doubleauth.awp', {
    token,
    verbe: 'post',
    data: { choix },
    cookieHeader,
  });

  console.log('[ED/QCM][answer] output', {
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
          choixLen: String(choix).length,
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
}
