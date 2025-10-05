// app/api/matieres/prefs/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Row = {
  code_matiere: string | null;
  matiere: string | null;
  choix: 'peu' | 'normal' | 'beaucoup' | null;
  score: number | null;
  updated_at: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawEleveId = body?.eleveId;
    const eleveId =
      typeof rawEleveId === 'string' ? parseInt(rawEleveId, 10) : Number(rawEleveId);

    if (!eleveId || Number.isNaN(eleveId)) {
      return NextResponse.json({ ok: false, error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('coef_matiere')
      .select('code_matiere, matiere, choix, score, updated_at')
      .eq('ed_eleve_id', eleveId);

    if (error) {
      console.error('[prefs/list] supabase error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const items = (data || [])
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
