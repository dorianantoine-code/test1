// app/api/agenda_perso/list/route.ts
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
    const rawEleveId = body?.eleveId;
    const eleveId = typeof rawEleveId === 'string' ? parseInt(rawEleveId, 10) : Number(rawEleveId);
    if (!eleveId || Number.isNaN(eleveId))
      return NextResponse.json({ ok: false, error: 'eleveId invalide' }, { status: 400 });

    const { data, error } = await supabase
      .from('agenda_perso')
      .select('id, ed_eleve_id, ed_account_id, event_type, days, note, created_at, updated_at')
      .eq('ed_eleve_id', eleveId)
      .order('updated_at', { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: any) {
    console.error('[agenda/list] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
