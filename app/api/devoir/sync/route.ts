/* app/api/devoir/sync/route.ts */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/* === CONFIG === */
const TABLE_NAME = 'devoir'; // <-- si ta table s'appelle 'devoirs', mets 'devoirs'

/* === Supabase (service role) === */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/* === Types === */
type EDDevoirItem = {
  idDevoir: number;
  donneLe?: string;
  matiere?: string;
  codeMatiere?: string;
  aFaire?: boolean;
  documentsAFaire?: boolean;
  rendreEnLigne?: boolean;
  interrogation?: boolean;
  effectue?: boolean; // seule source “fait/pas fait”
};

type CDTResponse = {
  code: number;
  token?: string;
  host?: string;
  data: Record<string, EDDevoirItem[]>;
  message?: string;
};

type Body = {
  eleveId: number; // ed_eleve_id
  ed_account_id?: number;
  cdtData: CDTResponse; // payload ED groupé par date
};

/* === Utils === */
const nowISO = () => new Date().toISOString();

function toRow(item: EDDevoirItem, dueDate: string, ed_eleve_id: number, ed_account_id?: number) {
  const r: any = {
    ed_eleve_id,
    ed_devoir_id: Number(item.idDevoir),
    due_date: dueDate,
    matiere: item.matiere ?? null,
    code_matiere: item.codeMatiere ?? null,
    donne_le: item.donneLe ?? null,
    a_faire: !!item.aFaire, // info
    documents_a_faire: !!item.documentsAFaire,
    rendre_en_ligne: !!item.rendreEnLigne,
    interrogation: !!item.interrogation,
    effectue: !!item.effectue, // vérité “fait/pas fait”
    last_sync_at: nowISO(),
    raw: item as any,
  };
  if (typeof ed_account_id === 'number') r.ed_account_id = ed_account_id;
  return r;
}

/** lit l’état actuel en DB pour une liste d’ids (avant ou après upsert) */
async function readState(
  ed_eleve_id: number,
  ids: number[],
  useTripleKey: boolean,
  ed_account_id?: number,
) {
  let q = supabase
    .from(TABLE_NAME)
    .select('ed_account_id,ed_eleve_id,ed_devoir_id,effectue,date_realisation,last_sync_at')
    .eq('ed_eleve_id', ed_eleve_id)
    .in('ed_devoir_id', ids);

  if (useTripleKey && typeof ed_account_id === 'number') {
    q = q.eq('ed_account_id', ed_account_id);
  }

  const { data, error } = await q;
  if (error) throw new Error(`readState error: ${error.message}`);
  return data || [];
}

async function tryUpsert(rows: any[], onConflict: string) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(rows, {
      onConflict,
      ignoreDuplicates: false,
      defaultToNull: false,
    })
    .select();
  if (error) throw new Error(error.message);
  return data || [];
}

/* === Handler === */
export async function POST(req: NextRequest) {
  let body: Body | any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { eleveId, ed_account_id: accMaybe, cdtData } = body as Body;

  if (
    typeof eleveId !== 'number' ||
    !cdtData ||
    !cdtData.data ||
    typeof cdtData.data !== 'object'
  ) {
    return NextResponse.json(
      { error: 'Bad payload: expected { eleveId, cdtData }' },
      { status: 400 },
    );
  }

  const ed_eleve_id = Number(eleveId);
  const ed_account_id = typeof accMaybe === 'number' ? Number(accMaybe) : undefined;
  const useTripleKey = typeof ed_account_id === 'number';

  // Aplatir
  const rows: any[] = [];
  const ids: number[] = [];
  for (const [date, items] of Object.entries(cdtData.data)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.idDevoir == null) continue;
      const id = Number(item.idDevoir);
      ids.push(id);
      rows.push(toRow(item, date, ed_eleve_id, ed_account_id));
    }
  }

  if (!rows.length) {
    return NextResponse.json({ ok: true, items: [], note: 'no rows' });
  }

  // LECTURE AVANT
  let before: any[] = [];
  try {
    before = await readState(ed_eleve_id, ids, useTripleKey, ed_account_id);
  } catch (e: any) {
    // on log seulement
    console.warn('[sync] read before failed:', e?.message || e);
  }

  // UPSERT
  let mode: 'triple-key' | 'double-key' = 'double-key';
  try {
    if (useTripleKey) {
      await tryUpsert(rows, 'ed_account_id,ed_eleve_id,ed_devoir_id');
      mode = 'triple-key';
    } else {
      await tryUpsert(
        rows.map(({ ed_account_id: _drop, ...r }) => r),
        'ed_eleve_id,ed_devoir_id',
      );
      mode = 'double-key';
    }
  } catch (e: any) {
    // fallback si la colonne ed_account_id n’existe pas réellement
    const msg = String(e?.message ?? '');
    if (useTripleKey && (msg.includes('ed_account_id') || msg.includes('schema cache'))) {
      const rowsNoAcc = rows.map(({ ed_account_id: _drop, ...r }) => r);
      await tryUpsert(rowsNoAcc, 'ed_eleve_id,ed_devoir_id');
      mode = 'double-key';
    } else {
      return NextResponse.json({ error: `Upsert failed: ${msg}` }, { status: 500 });
    }
  }

  // LECTURE APRÈS
  let after: any[] = [];
  try {
    after = await readState(ed_eleve_id, ids, useTripleKey, ed_account_id);
  } catch (e: any) {
    return NextResponse.json({ error: `Read after failed: ${e?.message || e}` }, { status: 500 });
  }

  // CONSTRUCTION DE LA RÉPONSE: items “après”, triés par due_date + id
  after.sort((a, b) => {
    if (a.due_date === b.due_date) return a.ed_devoir_id - b.ed_devoir_id;
    return String(a.due_date).localeCompare(String(b.due_date));
  });

  return NextResponse.json({
    ok: true,
    mode,
    table: TABLE_NAME,
    count: after.length,
    // pour vérifier le problème de mise à jour:
    // on renvoie uniquement ce qui est utile à contrôler
    items: after.map((r: any) => ({
      ed_devoir_id: r.ed_devoir_id,
      ed_eleve_id: r.ed_eleve_id,
      due_date: r.due_date,
      matiere: r.matiere,
      code_matiere: r.code_matiere,
      a_faire: r.a_faire,
      effectue: r.effectue,
      interrogation: r.interrogation,
      documents_a_faire: r.documents_a_faire,
      donne_le: r.donne_le,
      rendre_en_ligne: r.rendre_en_ligne,
      last_sync_at: r.last_sync_at,
      coef_matiere: r.coef_matiere,
      coef_controle: r.coef_controle,
      score: r.score,
      date_realisation: r.date_realisation ?? null,
    })),
    // Debug optionnel (dé-commente si besoin)
    // before,
  });
}
