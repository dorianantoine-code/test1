// app/api/ed/qcm/answer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall } from '../../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,
 *   "choix": string,          // souvent base64 fourni par /start
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
  const { token, choix, cookieHeader } = await req.json();

  if (!token || !choix) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'token et choix sont requis' },
      { status: 400 },
    );
  }

  const { res, json } = await edCall('/v3/connexion/doubleauth.awp', {
    token,
    verbe: 'post',
    data: { choix },
    cookieHeader,
  });

  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      data: json,
    },
    { status: res.ok ? 200 : res.status },
  );
}
