// app/api/matieres/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// NB: lecture simple -> ANON peut suffire si RLS le permet.
// Si tu as des policies restrictives, préfère SUPABASE_SERVICE_ROLE_KEY côté serveur.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const { eleveId } = await req.json();
    if (!eleveId || typeof eleveId !== 'number') {
      return NextResponse.json({ ok: false, error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    // On récupère les matières distinctes pour l’élève
    const { data, error } = await supabase
      .from('devoir')
      .select('code_matiere, matiere')
      .eq('ed_eleve_id', eleveId)
      .not('code_matiere', 'is', null)
      .not('matiere', 'is', null);

    if (error) {
      console.error('[matieres/list] supabase error:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Distinct par code_matiere, puis tri alpha par matiere
    const map = new Map<string, { code: string; label: string }>();
    for (const row of data || []) {
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
