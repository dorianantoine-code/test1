// app/api/matieres/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'Supabase URL/KEY manquants (matieres/list)' },
        { status: 500 },
      );
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { eleveId, etablissement } = await req.json();
    if (!eleveId || typeof eleveId !== 'number') {
      return NextResponse.json({ ok: false, error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    let etab: string | null = etablissement ? String(etablissement) : null;
    if (!etab) {
      const { data: eData, error: eErr } = await supabase
        .from('eleve')
        .select('etablissement')
        .eq('ed_eleve_id', eleveId)
        .maybeSingle();
      if (eErr) {
        console.error('[matieres/list] lookup eleve error:', eErr);
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

    // On récupère les matières distinctes pour l’élève
    const { data, error } = await supabase
      .from('devoir')
      .select('code_matiere, matiere')
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab)
      .not('code_matiere', 'is', null)
      .not('matiere', 'is', null);

    if (error) {
      console.error('[matieres/list] supabase error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let rows = data || [];
    // Fallback si aucune matière trouvée avec etab (legacy)
    if (!rows.length) {
      const { data: legacy, error: legacyErr } = await supabase
        .from('devoir')
        .select('code_matiere, matiere')
        .eq('ed_eleve_id', eleveId)
        .not('code_matiere', 'is', null)
        .not('matiere', 'is', null);
      if (!legacyErr && legacy) rows = legacy;
    }

    // Distinct par code_matiere, puis tri alpha par matiere
    const map = new Map<string, { code: string; label: string }>();
    for (const row of rows || []) {
      const code = String(row.code_matiere || '').trim();
      const label = String(row.matiere || '').trim();
      if (!code || !label) continue;
      if (!map.has(code)) map.set(code, { code, label });
    }

    const items = Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
    );

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error('[matieres/list] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
