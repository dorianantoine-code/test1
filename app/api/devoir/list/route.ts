// app/api/devoir/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Body = {
  eleveId: number | string;
  etablissement?: string | null;
  onlyFuture?: boolean;
};

function todayYMD() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const eleveId =
      typeof body?.eleveId === 'string' ? parseInt(body.eleveId, 10) : Number(body?.eleveId);
    const etablissement = (body?.etablissement ?? '').toString().trim() || null;
    const onlyFuture = body?.onlyFuture !== false; // par défaut true

    if (!eleveId || Number.isNaN(eleveId)) {
      return NextResponse.json(
        { ok: false, error: 'eleveId invalide' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let etab = etablissement;
    if (!etab) {
      const { data: eData, error: eErr } = await supabase
        .from('eleve')
        .select('etablissement')
        .eq('ed_eleve_id', eleveId)
        .maybeSingle();
      if (eErr)
        return NextResponse.json(
          { ok: false, error: eErr.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } },
        );
      etab = eData?.etablissement || null;
    }
    if (!etab) {
      return NextResponse.json(
        { ok: false, error: "Etablissement introuvable pour l'élève" },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    let q = supabase
      .from('devoir')
      .select(
        'ed_devoir_id, ed_eleve_id, due_date, matiere, code_matiere, a_faire, effectue, interrogation, documents_a_faire, donne_le, rendre_en_ligne, last_sync_at'
      )
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab);

    if (onlyFuture) {
      q = q.gte('due_date', todayYMD());
    }

    const { data: devoirs, error: dErr } = await q.order('due_date', { ascending: true });
    if (dErr)
      return NextResponse.json(
        { ok: false, error: dErr.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );

    // Récupérer les coef matière (score 1..3) pour cet élève
    const { data: cmRows, error: cErr } = await supabase
      .from('coef_matiere')
      .select('matiere, score')
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab);

    if (cErr)
      return NextResponse.json(
        { ok: false, error: cErr.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );

    const matiereScore = new Map<string, number>();
    for (const r of cmRows || []) {
      if (r?.matiere) matiereScore.set(String(r.matiere).trim().toUpperCase(), Number(r.score || 1));
    }

    // Enrichir avec les scores
    const CONTROL_COEF_IF_INTERRO = 2; // <- facile à ajuster si besoin
    const enriched = (devoirs || []).map((dv) => {
      const matKey = String(dv?.matiere || '').trim().toUpperCase();
      const coef_matiere = matiereScore.get(matKey) ?? 1;
      const coef_controle = dv?.interrogation ? CONTROL_COEF_IF_INTERRO : 1;
      const score = Number(coef_matiere) * Number(coef_controle);
      return {
        ...dv,
        coef_matiere,
        coef_controle,
        score,
      };
    });

    return NextResponse.json(
      { ok: true, items: enriched },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    console.error('[devoir/list] exception:', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erreur serveur' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
