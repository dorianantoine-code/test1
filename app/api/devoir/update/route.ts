/* app/api/devoir/update/route.ts */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TABLE_NAME = 'devoir'; // adapte si nécessaire

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Body = {
  ed_eleve_id: number;
  ed_devoir_id: number;
  action: 'today' | 'yesterday' | 'previous' | 'not_done';
  ed_account_id?: number; // optionnel si tu gères la triple clé
};

function isoShift(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  let body: Body | any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { ed_eleve_id, ed_devoir_id, action, ed_account_id } = body as Body;

  if (
    typeof ed_eleve_id !== 'number' ||
    typeof ed_devoir_id !== 'number' ||
    !['today', 'yesterday', 'previous', 'not_done'].includes(String(action))
  ) {
    return NextResponse.json(
      { error: 'Bad payload. Expect { ed_eleve_id, ed_devoir_id, action }' },
      { status: 400 }
    );
  }

  // Prépare la mise à jour
  const update: any = {};
  const nowIso = new Date().toISOString();

  switch (action) {
    case 'today':
      update.effectue = true;
      update.date_realisation = nowIso;
      break;
    case 'yesterday':
      update.effectue = true;
      update.date_realisation = isoShift(-1);
      break;
    case 'previous':
      update.effectue = true;
      update.date_realisation = isoShift(-2); // demandé : date - 2 jours
      break;
    case 'not_done':
      update.effectue = false;
      update.date_realisation = null; // <-- remis à null comme demandé
      break;
  }

  try {
    let q = supabase
      .from(TABLE_NAME)
      .update(update)
      .eq('ed_eleve_id', ed_eleve_id)
      .eq('ed_devoir_id', ed_devoir_id)
      .select(
        'ed_eleve_id,ed_devoir_id,effectue,date_realisation,due_date,matiere,code_matiere'
      );

    if (typeof ed_account_id === 'number') {
      q = q.eq('ed_account_id', ed_account_id);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      updated: data?.length ?? 0,
      item: data?.[0] ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Unknown error during update' },
      { status: 500 }
    );
  }
}
