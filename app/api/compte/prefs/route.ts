// app/api/compte/prefs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { accountId, darkMode, debugMode, fetchOnly } = await req.json();
    if (!accountId || !Number.isFinite(Number(accountId))) {
      return NextResponse.json({ error: 'accountId manquant ou invalide' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (fetchOnly) {
      const { data, error } = await supabase
        .from('compte')
        .select('pref_dark_mode, pref_debug_mode')
        .eq('ed_account_id', Number(accountId))
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, data });
    }

    const update: Record<string, any> = {};
    if (typeof darkMode === 'boolean') update.pref_dark_mode = darkMode;
    if (typeof debugMode === 'boolean') update.pref_debug_mode = debugMode;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucune valeur à enregistrer' }, { status: 400 });
    }

    const { error: upErr, data } = await supabase
      .from('compte')
      .update(update)
      .eq('ed_account_id', Number(accountId))
      .select()
      .maybeSingle();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
