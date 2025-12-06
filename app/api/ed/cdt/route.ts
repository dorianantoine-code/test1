// app/api/ed/cdt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall, ED_BASE, ED_VERSION } from '../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,   // X-Token
 *   "eleveId": number, // id de l'élève
 *   "cookieHeader"?: string
 * }
 *
 * Doc: GET /v3/Eleves/{id}/cahierdetexte.awp (verbe=get, data={})
 */
export async function POST(req: NextRequest) {
  const { token, eleveId, cookieHeader } = await req.json();

  if (!token || !eleveId) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'token et eleveId requis' },
      { status: 400 },
    );
  }

  try {
    const path = `/v3/Eleves/${eleveId}/cahierdetexte.awp`;

    // Log côté serveur
    console.log('[ED/CDT][REQUEST]', {
      url: `${ED_BASE}${path}?verbe=get&v=${ED_VERSION}`,
      eleveId,
    });

    const { res, json } = await edCall(path, {
      token,
      verbe: 'get',
      data: {}, // pas de params nécessaires d'après la doc
      cookieHeader,
    });

    console.log('[ED/CDT][RESPONSE]', {
      status: res.status,
      code: json?.code,
      hasData: !!json?.data,
    });

    return NextResponse.json(
      { ok: res.ok, status: res.status, data: json },
      {
        status: res.ok ? 200 : res.status,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (e: any) {
    console.error('[ED/CDT] ERROR', e?.message || e);
    return NextResponse.json(
      { ok: false, status: 500, message: e?.message || 'Erreur interne (CDT)' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
