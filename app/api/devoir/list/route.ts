// app/api/devoir/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";

function todayInParis(): string {
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`; // "YYYY-MM-DD"
}

export async function POST(req: NextRequest) {
  try {
    const { eleveId, accountId } = await req.json();
    const ed_eleve_id = Number(eleveId);
    if (!Number.isFinite(ed_eleve_id)) {
      return NextResponse.json({ error: "eleveId manquant ou invalide" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Vérifier l'élève et récupérer son compte
    const { data: eleve, error: eleveErr } = await supabase
      .from("eleve")
      .select("ed_account_id")
      .eq("ed_eleve_id", ed_eleve_id)
      .single();

    if (eleveErr || !eleve) {
      return NextResponse.json(
        { error: `Élève introuvable pour ed_eleve_id=${ed_eleve_id}` },
        { status: 404 }
      );
    }

    if (accountId != null) {
      const ed_account_id = Number(accountId);
      if (!Number.isFinite(ed_account_id) || ed_account_id !== eleve.ed_account_id) {
        return NextResponse.json(
          { error: "Le compte ne correspond pas à l'élève fourni." },
          { status: 403 }
        );
      }
    }

    const today = todayInParis();

    // due_date est un TEXT "YYYY-MM-DD" -> la comparaison lexicographique fonctionne
    const { data: items, error } = await supabase
      .from("devoir")
      .select(
        "ed_devoir_id,due_date,matiere,code_matiere,a_faire,documents_a_faire,donne_le,effectue,interrogation,rendre_en_ligne"
      )
      .eq("ed_eleve_id", ed_eleve_id)
      .gte("due_date", today)
      .order("due_date", { ascending: true })
      .order("matiere", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      eleveId: ed_eleve_id,
      items: items ?? [],
      today,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Erreur inconnue" }, { status: 500 });
  }
}
