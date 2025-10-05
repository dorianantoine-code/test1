// app/api/matieres/prefs/upsert/route.ts
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
  codeMatiere: string;
  matiere: string;
  choix: 'peu' | 'normal' | 'beaucoup';
  edAccountId?: number | string; // facultatif (on peut le déduire)
};

function scoreFor(choix: Body['choix']): 1 | 2 | 3 {
  if (choix === 'peu') return 1;
  if (choix === 'beaucoup') return 3;
  return 2; // normal
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const eleveId =
      typeof body.eleveId === 'string' ? parseInt(body.eleveId, 10) : Number(body.eleveId);
    const code = (body.codeMatiere || '').trim();
    const matiere = (body.matiere || '').trim();
    const choix = body.choix;

    if (!eleveId || Number.isNaN(eleveId)) {
      return NextResponse.json({ ok: false, error: 'eleveId invalide' }, { status: 400 });
    }
    if (!code || !matiere) {
      return NextResponse.json(
        { ok: false, error: 'codeMatiere et matiere requis' },
        { status: 400 },
      );
    }
    if (!['peu', 'normal', 'beaucoup'].includes(choix)) {
      return NextResponse.json({ ok: false, error: 'choix invalide' }, { status: 400 });
    }

    // Récup/valide ed_account_id
    let edAccountId: number | null = null;
    if (body.edAccountId) {
      edAccountId =
        typeof body.edAccountId === 'string'
          ? parseInt(body.edAccountId, 10)
          : Number(body.edAccountId);
    } else {
      // on déduit via la table 'eleve'
      const { data: eData, error: eErr } = await supabase
        .from('eleve')
        .select('ed_account_id')
        .eq('ed_eleve_id', eleveId)
        .maybeSingle();
      if (eErr) {
        console.error('[prefs/upsert] lookup eleve error:', eErr);
        return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
      }
      edAccountId = eData?.ed_account_id ?? null;
    }

    if (!edAccountId) {
      return NextResponse.json(
        { ok: false, error: "Impossible d'associer le compte (ed_account_id manquant)" },
        { status: 400 },
      );
    }

    const score = scoreFor(choix);

    // UPSERT par clé (ed_eleve_id, code_matiere)
    const { data, error } = await supabase
      .from('coef_matiere')
      .upsert(
        {
          ed_eleve_id: eleveId,
          ed_account_id: edAccountId,
          code_matiere: code,
          matiere,
          choix,
          score,
        },
        { onConflict: 'ed_eleve_id,code_matiere' },
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error('[prefs/upsert] supabase error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    console.error('[prefs/upsert] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
