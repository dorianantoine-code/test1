// app/api/ed/edt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall, ED_BASE, ED_VERSION } from '../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,
 *   "eleveId": number,
 *   "dateDebut": "YYYY-MM-DD",
 *   "dateFin":   "YYYY-MM-DD",
 *   "avecTrous"?: boolean,
 *   "cookieHeader"?: string
 * }
 *
 * Appel ED:
 *   POST /v3/E/{id}/emploidutemps.awp?verbe=get&v=...
 *   Headers: X-Token
 *   Body: data={ "dateDebut", "dateFin", "avecTrous": false }
 */
export async function POST(req: NextRequest) {
  const { token, eleveId, dateDebut, dateFin, avecTrous = false, cookieHeader } = await req.json();

  if (!token || !eleveId || !dateDebut || !dateFin) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'token, eleveId, dateDebut et dateFin sont requis' },
      { status: 400 },
    );
  }

  try {
    const path = `/v3/E/${eleveId}/emploidutemps.awp`;

    // Log côté serveur de la "requête GET" ED (en réalité POST verbe=get)
    console.log('[ED/EDT][REQUEST]', {
      url: `${ED_BASE}${path}?verbe=get&v=${ED_VERSION}`,
      data: { dateDebut, dateFin, avecTrous: !!avecTrous },
      eleveId,
    });

    const { res, json } = await edCall(path, {
      token,
      verbe: 'get',
      data: { dateDebut, dateFin, avecTrous: !!avecTrous },
      cookieHeader,
    });

    console.log('[ED/EDT][RESPONSE]', {
      status: res.status,
      code: json?.code,
      hasData: !!json?.data,
    });

    return NextResponse.json(
      { ok: res.ok, status: res.status, data: json },
      { status: res.ok ? 200 : res.status },
    );
  } catch (e: any) {
    console.error('[ED/EDT] ERROR', e?.message || e);
    return NextResponse.json(
      { ok: false, status: 500, message: e?.message || 'Erreur interne (EDT)' },
      { status: 500 },
    );
  }
}
