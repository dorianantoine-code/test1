// app/ed/agenda/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type EdtResponse = {
  ok: boolean;
  status: number;
  data: any;
};

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Cherche en priorité data.accounts[0].profile.eleves[0].id, sinon variantes. */
function findFirstEleveStrict(obj: any): { id: number; prenom?: string; nom?: string } | null {
  if (!obj) return null;

  // 1) Chemin attendu (prioritaire)
  const p1 = obj?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p1 && typeof p1.id === 'number') return { id: p1.id, prenom: p1.prenom, nom: p1.nom };

  // 2) Variantes fréquentes
  const p2 = obj?.accounts?.[0]?.profile?.eleves?.[0];
  if (p2 && typeof p2.id === 'number') return { id: p2.id, prenom: p2.prenom, nom: p2.nom };

  const p3 = obj?.data?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p3 && typeof p3.id === 'number') return { id: p3.id, prenom: p3.prenom, nom: p3.nom };

  // 3) Autres structures avec "eleves" (toujours éviter accounts[0].id !)
  const p4 = obj?.data?.eleves?.[0];
  if (p4 && typeof p4.id === 'number') return { id: p4.id, prenom: p4.prenom, nom: p4.nom };
  const p5 = obj?.eleves?.[0];
  if (p5 && typeof p5.id === 'number') return { id: p5.id, prenom: p5.prenom, nom: p5.nom };

  // 4) Exploration prudente: ne renvoyer que des objets qui ressemblent à un élève
  const seen = new Set<any>();
  const q: Array<{ node: any; parentKey?: string }> = [{ node: obj, parentKey: undefined }];

  while (q.length) {
    const { node, parentKey } = q.shift()!;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const it of node) q.push({ node: it, parentKey });
      continue;
    }

    // si on tombe sur une clé "eleves" → prendre le premier ayant un id numérique
    if (parentKey === 'eleves' && typeof node.id === 'number') {
      return { id: node.id, prenom: node.prenom, nom: node.nom };
    }

    // heuristique "élève" : id numérique + (prenom|nom|classe)
    if (
      typeof (node as any).id === 'number' &&
      (typeof (node as any).prenom === 'string' ||
        typeof (node as any).nom === 'string' ||
        (node as any).classe)
    ) {
      return { id: (node as any).id, prenom: (node as any).prenom, nom: (node as any).nom };
    }

    for (const [k, v] of Object.entries(node)) {
      if (v && (typeof v === 'object' || Array.isArray(v))) q.push({ node: v, parentKey: k });
    }
  }

  return null;
}

export default function AgendaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<any>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [eleveNomComplet, setEleveNomComplet] = useState<string | null>(null);

  const [dateDebut, setDateDebut] = useState(todayYMD());
  const [dateFin, setDateFin] = useState(todayYMD());
  const [avecTrous, setAvecTrous] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);

  // Récupère token + données login depuis la session et détecte l'élève
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      setToken(t);
      const parsed = d ? JSON.parse(d) : null;
      setLoginData(parsed);

      const e = findFirstEleveStrict(parsed?.data ?? parsed);
      if (e?.id) {
        setEleveId(e.id);
        setEleveNomComplet([e.prenom, e.nom].filter(Boolean).join(' ') || null);
      }

      // Logs côté client pour debug
      console.log('[Agenda] Session snapshot', {
        hasToken: !!t,
        foundEleve: e,
        primaryPathId: parsed?.data?.accounts?.[0]?.profile?.eleves?.[0]?.id,
      });
    } catch (e) {
      console.warn('[Agenda] parse session failed', e);
    }
  }, []);

  const headerEleve = useMemo(() => {
    if (eleveId && eleveNomComplet) return `Élève ${eleveNomComplet} (#${eleveId})`;
    if (eleveId) return `Élève #${eleveId}`;
    return 'Élève introuvable dans la session';
  }, [eleveId, eleveNomComplet]);

  async function loadEdt(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setRaw(null);
    setLoading(true);

    try {
      if (!token) throw new Error('Token manquant — reconnecte-toi.');
      if (!eleveId) throw new Error('Identifiant élève introuvable dans les données de session.');

      // Log côté client : ce qu'on envoie à notre API
      console.log('[Agenda] Request /api/ed/edt', {
        eleveId,
        dateDebut,
        dateFin,
        avecTrous,
      });

      const res = await fetch('/api/ed/edt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          eleveId,
          dateDebut,
          dateFin,
          avecTrous,
          // cookieHeader: sessionStorage.getItem("ed_cookie") || undefined,
        }),
      });

      const json: EdtResponse = await res.json();
      if (!json.ok) {
        throw new Error(`Échec de la récupération (status ${json.status})`);
      }
      setRaw(json.data);
    } catch (err: any) {
      setError(err?.message || "Erreur pendant le chargement de l'emploi du temps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // auto-chargement par défaut (aujourd'hui)
    if (token && eleveId) loadEdt().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eleveId]);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Emploi du temps</h1>
            <p className="text-sm text-gray-500">{headerEleve}</p>
          </div>

          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
            ← Retour
          </Link>
        </header>

        <form
          onSubmit={loadEdt}
          className="rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div>
            <label className="text-xs font-medium">Date début</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium">Date fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full rounded-xl border px-3 py-2"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="avecTrous"
              type="checkbox"
              checked={avecTrous}
              onChange={(e) => setAvecTrous(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="avecTrous" className="text-sm">
              Avec trous
            </label>
          </div>
          <button
            type="submit"
            disabled={loading || !eleveId}
            className="rounded-xl bg-black text-white py-2 disabled:opacity-50"
            title={!eleveId ? 'Élève introuvable dans la session' : 'Charger'}
          >
            {loading ? 'Chargement…' : 'Charger'}
          </button>
        </form>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-lg font-medium">Réponse brute</h2>
          <pre className="text-xs overflow-auto p-4 rounded-xl bg-gray-900 text-gray-100 font-mono leading-relaxed border border-gray-700">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
