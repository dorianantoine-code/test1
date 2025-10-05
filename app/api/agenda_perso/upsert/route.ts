// app/api/agenda_perso/upsert/route.ts
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
  id?: number | string;                  // si présent => update
  eleveId: number | string;
  eventType: 'Sport' | 'Musique' | 'Cours particulier' | 'Autres';
  days: number[] | string[];             // 1..7
  note?: string | null;
};

function normDays(input: Body['days']): number[] {
  const raw = Array.isArray(input) ? input : [];
  const set = new Set<number>();
  for (const v of raw) {
    const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
    if (Number.isFinite(n) && n >= 1 && n <= 7) set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const id = body.id ? (typeof body.id === 'string' ? parseInt(body.id, 10) : Number(body.id)) : null;

    const eleveId = typeof body.eleveId === 'string' ? parseInt(body.eleveId, 10) : Number(body.eleveId);
    if (!eleveId || Number.isNaN(eleveId))
      return NextResponse.json({ ok: false, error: 'eleveId invalide' }, { status: 400 });

    const eventType = body.eventType;
    if (!['Sport', 'Musique', 'Cours particulier', 'Autres'].includes(eventType))
      return NextResponse.json({ ok: false, error: 'eventType invalide' }, { status: 400 });

    const days = normDays(body.days);
    if (!days.length)
      return NextResponse.json({ ok: false, error: 'Sélectionnez au moins un jour' }, { status: 400 });

    const note = body.note ?? null;

    // récupérer ed_account_id via la table eleve
    const { data: eData, error: eErr } = await supabase
      .from('eleve')
      .select('ed_account_id')
      .eq('ed_eleve_id', eleveId)
      .maybeSingle();

    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });
    const edAccountId = eData?.ed_account_id;
    if (!edAccountId)
      return NextResponse.json({ ok: false, error: "Compte associé introuvable" }, { status: 400 });

    if (!id) {
      // INSERT
      const { data, error } = await supabase
        .from('agenda_perso')
        .insert({
          ed_eleve_id: eleveId,
          ed_account_id: edAccountId,
          event_type: eventType,
          days,
          note,
        })
        .select()
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, data });
    } else {
      // UPDATE (sécuriser que la ligne appartient à cet élève)
      const { data: row, error: rErr } = await supabase
        .from('agenda_perso')
        .select('id, ed_eleve_id')
        .eq('id', id)
        .maybeSingle();
      if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
      if (!row || row.ed_eleve_id !== eleveId)
        return NextResponse.json({ ok: false, error: "Élément introuvable pour cet élève" }, { status: 404 });

      const { data, error } = await supabase
        .from('agenda_perso')
        .update({
          event_type: eventType,
          days,
          note,
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, data });
    }
  } catch (e: any) {
    console.error('[agenda/upsert] exception:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur serveur' }, { status: 500 });
  }
}
