// app/api/devoir/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

type DevoirItem = {
  matiere?: string;
  codeMatiere?: string;
  aFaire?: boolean;
  idDevoir: number;
  documentsAFaire?: boolean;
  donneLe?: string; // "YYYY-MM-DD"
  effectue?: boolean;
  interrogation?: boolean;
  rendreEnLigne?: boolean;
  // ... parfois ED peut retourner d’autres clés -> on garde en raw
};

type CdtData = Record<string, DevoirItem[]>; // { "YYYY-MM-DD": [ {...}, ... ] }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eleveId: number | undefined = body?.eleveId;
    const cdtData: CdtData | undefined = body?.cdtData?.data ?? body?.cdtData;

    if (!eleveId) {
      return NextResponse.json({ error: 'eleveId manquant' }, { status: 400 });
    }

    let data: CdtData | null = null;

    // 1) Si on nous fournit directement le JSON déjà affiché sur le dashboard
    if (cdtData && typeof cdtData === 'object') {
      data = cdtData;
    } else if (body?.token) {
      // 2) Fallback : on recharge via la route existante /api/ed/cdt (sans la casser)
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/ed/cdt`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: body.token, eleveId }),
        cache: 'no-store',
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Echec chargement CDT: HTTP ${res.status} ${text}` },
          { status: 502 },
        );
      }
      const json = await res.json();
      const maybeData: any = json?.data?.cahierDeTexte ?? json?.data ?? json?.result ?? json;

      if (!maybeData || typeof maybeData !== 'object') {
        return NextResponse.json({ error: 'Format CDT inattendu' }, { status: 502 });
      }
      data = maybeData as CdtData;
    } else {
      return NextResponse.json(
        {
          error: 'Fournis cdtData (objet) OU token pour recharger depuis /api/ed/cdt',
        },
        { status: 400 },
      );
    }

    const rows: any[] = [];
    for (const [dueDate, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const ed_devoir_id = Number(item.idDevoir);
        if (!Number.isFinite(ed_devoir_id)) continue;

        rows.push({
          ed_eleve_id: eleveId,
          ed_devoir_id,
          due_date: dueDate, // TEXT dans ton schéma
          matiere: item.matiere ?? null,
          code_matiere: item.codeMatiere ?? null,
          a_faire: item.aFaire ?? null,
          documents_a_faire: item.documentsAFaire ?? null,
          donne_le: item.donneLe ?? null,
          effectue: item.effectue ?? null,
          interrogation: item.interrogation ?? null,
          rendre_en_ligne: item.rendreEnLigne ?? null,
          last_sync_at: new Date().toISOString(), // 👈 force la mise à jour à chaque sync
          // last_sync_at: default now() côté DB
          raw: item, // conserve l’item brut
        });
      }
    }

    if (!rows.length) {
      return NextResponse.json({ inserted: 0, updated: 0, total: 0 }, { status: 200 });
    }

    const supabase = getSupabaseAdmin();

    // ⚠️ upsert sur PK composite -> onConflict doit cibler les deux colonnes
    const { data: upserted, error } = await supabase
      .from('devoir')
      .upsert(rows, {
        onConflict: 'ed_eleve_id,ed_devoir_id',
        ignoreDuplicates: false,
        defaultToNull: false,
      })
      .select(); // pour retourner le total upserté (insert+update)

    if (error) {
      return NextResponse.json(
        { error: `Supabase upsert error: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { inserted_or_updated: upserted?.length ?? 0, total_payload: rows.length },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
