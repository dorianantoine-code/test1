// app/api/ed/cdt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { edCall, ED_BASE, ED_VERSION } from '../_shared';

export const runtime = 'nodejs';

type CDTDayDetail = {
  matieres?: Array<{
    id?: number;
    codeMatiere?: string;
    aFaire?: {
      idDevoir?: number;
      effectue?: boolean;
    };
    contenuDeSeance?: { idDevoir?: number };
  }>;
};

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

    // Enrichissement : pour chaque date, on va chercher le détail jour
    // pour obtenir un champ "effectue" fiable (observé comme correct côté détail jour).
    let overrides = 0;
    const root =
      json?.data?.cahierDeTexte ??
      json?.data ??
      json?.cahierDeTexte ??
      null;

    if (root && typeof root === 'object') {
      const dates = Object.keys(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      for (const dateStr of dates) {
        try {
          const detailPath = `/v3/Eleves/${eleveId}/cahierdetexte/${dateStr}.awp`;
          const { json: detailJson } = await edCall(detailPath, {
            token,
            verbe: 'get',
            data: {},
            cookieHeader,
          });

          const detail = detailJson?.data as CDTDayDetail | undefined;
          const matieres = detail?.matieres || [];
          const effectueById = new Map<number, boolean>();
          for (const m of matieres) {
            const id = Number(m?.aFaire?.idDevoir ?? m?.id ?? m?.contenuDeSeance?.idDevoir);
            if (!id) continue;
            const eff = m?.aFaire?.effectue;
            if (typeof eff === 'boolean') {
              effectueById.set(id, eff);
            }
          }

          if (effectueById.size > 0 && Array.isArray(root[dateStr])) {
            for (const item of root[dateStr]) {
              const id = Number(item?.idDevoir ?? item?.id);
              if (!id) continue;
              if (effectueById.has(id)) {
                const eff = effectueById.get(id)!;
                if (item.effectue !== eff) {
                  overrides += 1;
                  item.effectue = eff;
                }
              }
            }
          }
        } catch (err) {
          console.warn('[ED/CDT][DETAIL] fail', dateStr, err?.message || err);
        }
      }
      if (overrides > 0) {
        console.log('[ED/CDT] effectue overrides from daily details:', overrides);
      }
    }

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
