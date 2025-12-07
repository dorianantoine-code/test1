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
    const { eleveId, jour, etablissement, score } = await req.json();
    if (!eleveId || !Number.isFinite(Number(eleveId))) {
      return NextResponse.json({ error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1) Retrouver l'établissement de l'élève (cohérence référentielle)
    let etab: string | null = (etablissement ?? '').toString().trim() || null;
    if (!etab) {
      const { data: eleve, error: eleveErr } = await supabase
      .from('eleve')
      .select('etablissement')
      .eq('ed_eleve_id', Number(eleveId))
      .single();
      if (eleveErr || !eleve) {
        return NextResponse.json(
          { error: `Élève introuvable pour ed_eleve_id=${eleveId}` },
          { status: 404 },
        );
      }
      etab = eleve.etablissement || null;
    }
    if (!etab) {
      return NextResponse.json(
        { error: "Etablissement introuvable pour l'élève" },
        { status: 400 },
      );
    }

    const jourStr: string =
      typeof jour === 'string' && jour.length >= 10 ? jour.slice(0, 10) : todayInParis();

    // 2) Upsert manuel (sans contrainte unique requise)
    const payload = {
      ed_eleve_id: Number(eleveId),
      etablissement: etab,
      jour: jourStr, // Postgres cast -> date
      updated_at: new Date().toISOString(), // utile même si trigger existe
      score: score != null && Number.isFinite(Number(score)) ? Number(score) : null,
    };

    // cherche une fiche existante
    const { data: existing, error: findErr } = await supabase
      .from('fiche_devoir')
      .select('id')
      .eq('ed_eleve_id', payload.ed_eleve_id)
      .eq('etablissement', payload.etablissement)
      .eq('jour', payload.jour)
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    if (existing?.id) {
      const { data: updated, error: updErr } = await supabase
        .from('fiche_devoir')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ ok: true, jour: jourStr, fiche: updated ?? null });
    }

    const { data: inserted, error: insErr } = await supabase
      .from('fiche_devoir')
      .insert(payload)
      .select()
      .maybeSingle();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, jour: jourStr, fiche: inserted ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
