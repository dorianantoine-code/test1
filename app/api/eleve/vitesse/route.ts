import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin';

type Body = {
  eleveId: number | string;
  etablissement?: string | null;
  coef?: 'tres_lent' | 'normal' | 'tres_rapide';
};

const supabase = getSupabaseAdmin();

const LABELS: Record<number, string> = {
  1: 'Très lent',
  2: 'Normal',
  3: 'Très rapide',
};
const VALID: Record<string, number> = {
  tres_lent: 1,
  normal: 2,
  tres_rapide: 3,
};

async function resolveEtab(eleveId: number, etab?: string | null) {
  if (etab) return etab;
  const { data, error } = await supabase
    .from('eleve')
    .select('etablissement')
    .eq('ed_eleve_id', eleveId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Lookup eleve: ${error.message}`);
  if (!data?.etablissement) throw new Error("Etablissement introuvable pour l'élève");
  return data.etablissement as string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const eleveId =
      typeof body?.eleveId === 'string' ? parseInt(body.eleveId, 10) : Number(body?.eleveId);
    if (!eleveId || Number.isNaN(eleveId)) {
      return NextResponse.json(
        { ok: false, error: 'eleveId invalide' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const etab = await resolveEtab(eleveId, body?.etablissement ?? null);
    const coefVal =
      body?.coef && VALID[body.coef] ? VALID[body.coef] : undefined; // undefined => lecture uniquement

    if (coefVal !== undefined) {
      const { error: upErr } = await supabase
        .from('eleve')
        .update({ coef_vitesse_travail: coefVal })
        .eq('ed_eleve_id', eleveId)
        .eq('etablissement', etab);
      if (upErr) {
        return NextResponse.json(
          { ok: false, error: upErr.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
      }
    }

    const { data, error } = await supabase
      .from('eleve')
      .select('coef_vitesse_travail')
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const val = data?.coef_vitesse_travail ?? null;
    const numeric = typeof val === 'number' ? val : null;
    const label = numeric && LABELS[numeric] ? LABELS[numeric] : null;

    return NextResponse.json(
      { ok: true, value: numeric, label, etablissement: etab },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erreur serveur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
