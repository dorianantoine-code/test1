// app/api/matieres/prefs/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Row = {
  code_matiere: string | null;
  matiere: string | null;
  choix: 'peu' | 'normal' | 'beaucoup' | null;
  score: number | null;
  updated_at: string | null;
};

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'Supabase URL/KEY manquants (prefs/list)' },
        { status: 500 },
      );
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const rawEleveId = body?.eleveId;
    const etablissement = (body?.etablissement ?? '').toString().trim() || null;
    const eleveId =
      typeof rawEleveId === 'string' ? parseInt(rawEleveId, 10) : Number(rawEleveId);

    if (!eleveId || Number.isNaN(eleveId)) {
      return NextResponse.json({ ok: false, error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    let etab = etablissement;
    if (!etab) {
      const { data: eData, error: eErr } = await supabase
        .from('eleve')
        .select('etablissement')
        .eq('ed_eleve_id', eleveId)
        .maybeSingle();
      if (eErr) {
        console.error('[prefs/list] lookup eleve error:', eErr);
        return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
      }
      etab = eData?.etablissement || null;
    }
    if (!etab) {
      return NextResponse.json(
        { ok: false, error: "Etablissement introuvable pour l'élève" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from('coef_matiere')
      .select('code_matiere, matiere, choix, score, updated_at')
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab);

    if (error) {
      console.error('[prefs/list] supabase error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Fallback si aucune ligne (données legacy sans etablissement)
    let rows = data || [];
    if (!rows.length) {
      const { data: legacy, error: legacyErr } = await supabase
        .from('coef_matiere')
        .select('code_matiere, matiere, choix, score, updated_at')
        .eq('ed_eleve_id', eleveId);
      if (!legacyErr && legacy) rows = legacy;
    }

    const items = (rows || [])
      .filter((r: Row) => r.code_matiere && r.matiere && r.choix)
      .map((r: Row) => ({
        code: String(r.code_matiere),
        label: String(r.matiere),
        choix: r.choix as 'peu' | 'normal' | 'beaucoup',
        score: Number(r.score ?? 0),
        updatedAt: r.updated_at,
      }));

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error('[prefs/list] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
