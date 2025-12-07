// app/api/fiche/sync-devoirs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { ficheId, eleveId, etablissement, devoirIds } = await req.json();
    if (!ficheId || !Number.isFinite(Number(ficheId))) {
      return NextResponse.json({ error: 'ficheId manquant ou invalide' }, { status: 400 });
    }
    if (!eleveId || !Number.isFinite(Number(eleveId))) {
      return NextResponse.json({ error: 'eleveId manquant ou invalide' }, { status: 400 });
    }

    const ids: number[] = Array.isArray(devoirIds)
      ? Array.from(
          new Set(
            devoirIds
              .map((v: any) => Number(v))
              .filter((v: number) => Number.isFinite(v) && v > 0),
          ),
        )
      : [];

    const supabase = getSupabaseAdmin();

    // Vérifier la fiche
    const { data: fiche, error: ficheErr } = await supabase
      .from('fiche_devoir')
      .select('id, ed_eleve_id, etablissement')
      .eq('id', Number(ficheId))
      .maybeSingle();
    if (ficheErr) {
      return NextResponse.json({ error: ficheErr.message }, { status: 500 });
    }
    if (!fiche) {
      return NextResponse.json({ error: 'fiche_devoir introuvable' }, { status: 404 });
    }
    if (fiche.ed_eleve_id !== Number(eleveId)) {
      return NextResponse.json({ error: 'fiche_devoir ne correspond pas à cet élève' }, { status: 400 });
    }
    if (etablissement && fiche.etablissement && fiche.etablissement !== etablissement) {
      return NextResponse.json({ error: "Etablissement incohérent avec la fiche" }, { status: 400 });
    }

    // Supprime les associations qui ne sont plus vertes
    const { error: delErr } = await supabase
      .from('fiche_devoir_devoir')
      .delete()
      .eq('fiche_id', Number(ficheId))
      .not('ed_devoir_id', 'in', ids.length ? `(${ids.join(',')})` : '(0)');
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    // Ajoute / conserve les associations vertes
    if (ids.length > 0) {
      const rows = ids.map((id) => ({
        fiche_id: Number(ficheId),
        ed_devoir_id: id,
        ed_eleve_id: Number(eleveId),
        etablissement: fiche.etablissement || etablissement || null,
      }));

      const { error: upErr } = await supabase.from('fiche_devoir_devoir').upsert(rows, {
        onConflict: 'fiche_id,ed_devoir_id',
      });
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, linked: ids.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
