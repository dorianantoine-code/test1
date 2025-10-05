// app/api/agenda_perso/delete/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawId = body?.id;
    const id = typeof rawId === 'string' ? parseInt(rawId, 10) : Number(rawId);
    const rawEleveId = body?.eleveId;
    const eleveId = typeof rawEleveId === 'string' ? parseInt(rawEleveId, 10) : Number(rawEleveId);

    if (!id || Number.isNaN(id)) return NextResponse.json({ ok: false, error: 'id invalide' }, { status: 400 });
    if (!eleveId || Number.isNaN(eleveId))
      return NextResponse.json({ ok: false, error: 'eleveId invalide' }, { status: 400 });

    // sécurité : vérifier appartenance à l'élève
    const { data: row, error: rErr } = await supabase
      .from('agenda_perso')
      .select('id, ed_eleve_id')
      .eq('id', id)
      .maybeSingle();
    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
    if (!row || row.ed_eleve_id !== eleveId)
      return NextResponse.json({ ok: false, error: "Élément introuvable pour cet élève" }, { status: 404 });

    const { error } = await supabase.from('agenda_perso').delete().eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[agenda/delete] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
