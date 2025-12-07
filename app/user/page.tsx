"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";

type Row = {
  id: string;
  username: string;
  password: string;
  created_at: string;
};

function UserPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get("id");
  const [row, setRow] = useState<Row | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("users_demo")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        setRow(data as Row);
      } catch (e: any) {
        setErrorMsg(e.message || "Introuvable");
      }
    })();
  }, [id]);

  if (!id) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border p-6">
          <p>Aucun id fourni. <button onClick={() => router.push("/")} className="underline">Retour</button></p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Enregistrement</h1>
        {errorMsg && <p className="text-red-600">{errorMsg}</p>}
        {!row && !errorMsg && <p>Chargement…</p>}
        {row && (
          <div className="space-y-2">
            <p><span className="font-semibold">ID :</span> {row.id}</p>
            <p><span className="font-semibold">Utilisateur :</span> {row.username}</p>
            <p><span className="font-semibold">Mot de passe :</span> {row.password}</p>
            <p className="text-sm text-gray-500">Créé le : {new Date(row.created_at).toLocaleString()}</p>
            <button onClick={() => router.push("/")} className="mt-4 rounded-md px-3 py-2 bg-gray-200 hover:bg-gray-300">
              Revenir au formulaire
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

export default function UserPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center p-6">Chargement…</div>}>
      <UserPageInner />
    </Suspense>
  );
}
