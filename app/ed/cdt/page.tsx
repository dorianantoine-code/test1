// app/ed/cdt/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CdtResponse = {
  ok: boolean;
  status: number;
  data: any;
};

/** Cherche en priorité data.accounts[0].profile.eleves[0].id, sinon variantes. */
function findFirstEleveStrict(obj: any): { id: number; prenom?: string; nom?: string } | null {
  if (!obj) return null;

  const p1 = obj?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p1 && typeof p1.id === 'number') return { id: p1.id, prenom: p1.prenom, nom: p1.nom };

  const p2 = obj?.accounts?.[0]?.profile?.eleves?.[0];
  if (p2 && typeof p2.id === 'number') return { id: p2.id, prenom: p2.prenom, nom: p2.nom };

  const p3 = obj?.data?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p3 && typeof p3.id === 'number') return { id: p3.id, prenom: p3.prenom, nom: p3.nom };

  const p4 = obj?.data?.eleves?.[0];
  if (p4 && typeof p4.id === 'number') return { id: p4.id, prenom: p4.prenom, nom: p4.nom };
  const p5 = obj?.eleves?.[0];
  if (p5 && typeof p5.id === 'number') return { id: p5.id, prenom: p5.prenom, nom: p5.nom };

  return null;
}

export default function CdtPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<any>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [eleveNomComplet, setEleveNomComplet] = useState<string | null>(null);

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

      console.log('[CDT] Session snapshot', {
        hasToken: !!t,
        foundEleve: e,
        primaryPathId: parsed?.data?.accounts?.[0]?.profile?.eleves?.[0]?.id,
      });
    } catch (e) {
      console.warn('[CDT] parse session failed', e);
    }
  }, []);

  const headerEleve = useMemo(() => {
    if (eleveId && eleveNomComplet) return `Élève ${eleveNomComplet} (#${eleveId})`;
    if (eleveId) return `Élève #${eleveId}`;
    return 'Élève introuvable dans la session';
  }, [eleveId, eleveNomComplet]);

  async function loadCdt(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setRaw(null);
    setLoading(true);

    try {
      if (!token) throw new Error('Token manquant — reconnecte-toi.');
      if (!eleveId) throw new Error('Identifiant élève introuvable dans les données de session.');

      console.log('[CDT] Request /api/ed/cdt', { eleveId });

      const res = await fetch('/api/ed/cdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          eleveId,
          // cookieHeader: sessionStorage.getItem("ed_cookie") || undefined,
        }),
      });

      const json: CdtResponse = await res.json();
      if (!json.ok) {
        throw new Error(`Échec de la récupération (status ${json.status})`);
      }
      setRaw(json.data);
    } catch (err: any) {
      setError(err?.message || 'Erreur pendant le chargement du cahier de texte.');
    } finally {
      setLoading(false);
    }
  }

  // auto-chargement au montage
  useEffect(() => {
    if (token && eleveId) loadCdt().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eleveId]);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Cahier de texte</h1>
            <p className="text-sm text-gray-500">{headerEleve}</p>
          </div>

          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
            ← Retour
          </Link>
        </header>

        <form onSubmit={loadCdt} className="rounded-2xl border p-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !eleveId}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
            title={!eleveId ? 'Élève introuvable dans la session' : 'Recharger'}
          >
            {loading ? 'Chargement…' : 'Recharger'}
          </button>
          <span className="text-xs text-gray-500">
            L’API renvoie les devoirs « à faire » à partir d’aujourd’hui, groupés par date.
          </span>
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
