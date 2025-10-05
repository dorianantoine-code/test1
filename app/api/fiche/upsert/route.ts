// app/api/fiche/upsert/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

function todayInParis(): string {
  // Produit "YYYY-MM-DD" pour l'Europe/Paris
  const fmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export async function POST(req: NextRequest) {
  try {
    const { eleveId, jour } = await req.json();
    if (!eleveId || !Number.isFinite(Number(eleveId))) {
      return NextResponse.json({ error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1) Retrouver le compte associé à l'élève (cohérence référentielle)
    const { data: eleve, error: eleveErr } = await supabase
      .from('eleve')
      .select('ed_account_id')
      .eq('ed_eleve_id', Number(eleveId))
      .single();

    if (eleveErr || !eleve) {
      return NextResponse.json(
        { error: `Élève introuvable pour ed_eleve_id=${eleveId}` },
        { status: 404 },
      );
    }

    const jourStr: string =
      typeof jour === 'string' && jour.length >= 10 ? jour.slice(0, 10) : todayInParis();

    // 2) Upsert (1 fiche par élève et par jour)
    const payload = {
      ed_eleve_id: Number(eleveId),
      ed_account_id: eleve.ed_account_id,
      jour: jourStr, // Postgres cast -> date
      updated_at: new Date().toISOString(), // utile même si trigger existe
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from('fiche_devoir')
      .upsert(payload, {
        onConflict: 'ed_eleve_id,jour',
        ignoreDuplicates: false,
        defaultToNull: false,
      })
      .select()
      .limit(1);

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jour: jourStr, fiche: upserted?.[0] ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
