// app/api/agenda_perso/list/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'Supabase URL/KEY manquants (agenda/list)' },
        { status: 500 },
      );
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const rawEleveId = body?.eleveId;
    const eleveId = typeof rawEleveId === 'string' ? parseInt(rawEleveId, 10) : Number(rawEleveId);
    if (!eleveId || Number.isNaN(eleveId))
      return NextResponse.json({ ok: false, error: 'eleveId invalide' }, { status: 400 });
    const etablissement = (body?.etablissement ?? '').toString().trim() || null;

    let etab = etablissement;
    if (!etab) {
    const { data: eData, error: eErr } = await supabase
      .from('eleve')
      .select('etablissement')
      .eq('ed_eleve_id', eleveId)
      .maybeSingle();
      if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
      etab = eData?.etablissement || null;
    }
    if (!etab)
      return NextResponse.json(
        { ok: false, error: "Etablissement introuvable pour l'élève" },
        { status: 400 },
      );

    const { data, error } = await supabase
      .from('agenda_perso')
      .select('id, ed_eleve_id, etablissement, event_type, days, note, created_at, updated_at')
      .eq('ed_eleve_id', eleveId)
      .eq('etablissement', etab)
      .order('updated_at', { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Fallback compatibilité: si aucune ligne trouvée avec etablissement (données legacy),
    // on tente sans le filtre etablissement pour ne pas masquer les anciens enregistrements.
    let items = data || [];
    if (!items.length) {
      const { data: legacy, error: legacyErr } = await supabase
        .from('agenda_perso')
        .select('id, ed_eleve_id, etablissement, event_type, days, note, created_at, updated_at')
        .eq('ed_eleve_id', eleveId)
        .order('updated_at', { ascending: false });
      if (!legacyErr && legacy) items = legacy;
    }

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    console.error('[agenda/list] exception:', e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erreur serveur (agenda/list)' },
      { status: 500 },
    );
  }
}
