// app/api/ed/cdt/day/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall, ED_BASE, ED_VERSION } from '../../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "token": string,          // X-Token
 *   "eleveId": number,        // id élève
 *   "date": "YYYY-MM-DD",     // jour à détailler
 *   "cookieHeader"?: string
 * }
 *
 * Doc: GET /v3/Eleves/{id}/cahierdetexte/{AAAA-MM-JJ}.awp (verbe=get, data={})
 */
export async function POST(req: NextRequest) {
  const { token, eleveId, date, cookieHeader } = await req.json();

  if (!token || !eleveId || !date) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'token, eleveId et date sont requis' },
      { status: 400 },
    );
  }

  try {
    const path = `/v3/Eleves/${eleveId}/cahierdetexte/${date}.awp`;

    console.log('[ED/CDT-DAY][REQUEST]', {
      url: `${ED_BASE}${path}?verbe=get&v=${ED_VERSION}`,
      eleveId,
      date,
    });

    const { res, json } = await edCall(path, {
      token,
      verbe: 'get',
      data: {},
      cookieHeader,
    });

    console.log('[ED/CDT-DAY][RESPONSE]', {
      status: res.status,
      code: json?.code,
      hasData: !!json?.data,
    });

    return NextResponse.json(
      { ok: res.ok, status: res.status, data: json },
      { status: res.ok ? 200 : res.status },
    );
  } catch (e: any) {
    console.error('[ED/CDT-DAY] ERROR', e?.message || e);
    return NextResponse.json(
      { ok: false, status: 500, message: e?.message || 'Erreur interne (CDT day)' },
      { status: 500 },
    );
  }
}
