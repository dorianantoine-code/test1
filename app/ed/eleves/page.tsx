// app/ed/eleves/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Eleve = {
  id: number;
  prenom?: string;
  nom?: string;
  photo?: string; // peut être //doc1.... -> on préfixera https:
};

export default function ElevesPage() {
  const router = useRouter();
  const [loginData, setLoginData] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      setToken(t);
      setLoginData(d ? JSON.parse(d) : null);
    } catch {}
  }, []);

  // Extrait tous les élèves de tous les comptes
  const eleves: Eleve[] = useMemo(() => {
    const root = loginData?.data ?? loginData;
    const accs: any[] = root?.accounts ?? [];
    const list: Eleve[] = [];
    for (const a of accs) {
      const arr = a?.profile?.eleves ?? [];
      for (const e of arr) {
        if (e && typeof e.id === 'number') {
          list.push({
            id: e.id,
            prenom: e.prenom,
            nom: e.nom,
            photo: e.photo,
          });
        }
      }
    }
    // déduplique par id
    const map = new Map<number, Eleve>();
    for (const e of list) map.set(e.id, e);
    return Array.from(map.values());
  }, [loginData]);

  function photoUrl(src?: string) {
    if (!src) return undefined;
    if (src.startsWith('//')) return 'https:' + src;
    if (src.startsWith('/')) return src;
    if (src.startsWith('http')) return src;
    return src;
  }

  function selectEleve(eleve: Eleve) {
    try {
      sessionStorage.setItem('ed_selected_eleve_id', String(eleve.id));
      sessionStorage.setItem(
        'ed_selected_eleve_name',
        [eleve.prenom, eleve.nom].filter(Boolean).join(' '),
      );
      if (eleve.photo)
        sessionStorage.setItem('ed_selected_eleve_photo', photoUrl(eleve.photo) || '');
    } catch {}
    router.push('/dashboard');
  }

  // Si pas loggé → retour login
  useEffect(() => {
    if (token === null) return; // attend le chargement
    if (!token) router.replace('/');
  }, [token, router]);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Choisir un élève</h1>
            <p className="text-sm text-white/80">
              Sélectionne l’élève pour lequel afficher le tableau de bord.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border px-4 py-2 text-white border-white/40 hover:bg-white/10"
          >
            ← Déconnexion
          </Link>
        </header>

        <section className="rounded-2xl border p-4 border-gray-300 bg-white/60 backdrop-blur">
          {eleves.length === 0 ? (
            <div className="text-sm text-black">
              Aucun élève détecté dans les données de session.
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-gray-700">
                  Debug: données brutes
                </summary>
                <pre className="text-xs overflow-auto p-3 rounded-xl bg-gray-900 text-gray-100 font-mono leading-relaxed border border-gray-700">
                  {JSON.stringify(loginData, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {eleves.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEleve(e)}
                  className="group rounded-xl border border-gray-300 bg-white hover:shadow-md transition p-3 flex flex-col items-center gap-2"
                >
                  <div className="h-24 w-24 rounded-full overflow-hidden border border-gray-300">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl(e.photo) || '/placeholder-avatar.png'}
                      alt={e.prenom || 'Élève'}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-medium text-black">
                    {e.prenom || 'Élève'}
                    {/* on n'affiche que le prénom comme demandé */}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
