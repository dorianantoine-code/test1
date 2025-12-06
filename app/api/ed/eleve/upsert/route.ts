import { NextResponse } from 'next/server';
import { upsertEleveFromPayload } from '../../../../lib/ed/eleveUpsert';

/**
 * Endpoint d'upsert élève (Option: post-sélection).
 * Payload attendu:
 *   { eleve: {...}, ed_account_id?: string }
 * Retour:
 *   { ok: boolean, status: number, data?: any, error?: string }
 */
export async function POST(req: Request) {
  console.log('[API] /api/ed/eleve/upsert → POST');
  try {
    const body = await req.json().catch(() => ({}));
    const eleve = body?.eleve;
    const edAccountId = body?.ed_account_id ? String(body.ed_account_id) : undefined;
    const etablissement = body?.etablissement ? String(body.etablissement) : undefined;

    if (!eleve || typeof eleve !== 'object') {
      const resp = { ok: false, status: 400, error: 'payload { eleve } requis' };
      return NextResponse.json(resp, { status: 400 });
    }

    const data = await upsertEleveFromPayload(eleve, edAccountId, etablissement);
    return NextResponse.json({ ok: true, status: 200, data }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || 'Erreur serveur';
    console.error('[API] upsert eleve error', msg);
    return NextResponse.json({ ok: false, status: 500, error: msg }, { status: 500 });
  }
}
