// app/ed/eleves/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../../styles/readable.module.css';
import { upsertSelectedEleve } from '../../lib/ed/eleveUpsertClient';

type Eleve = {
  id: number;
  prenom?: string;
  nom?: string;
  photo?: string; // souvent //doc1.ecoledirecte.com/PhotoEleves/...
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

  // Extrait tous les élèves
  const eleves: Eleve[] = useMemo(() => {
    const root = loginData?.data ?? loginData;
    const accs: any[] = root?.accounts ?? [];
    const list: Eleve[] = [];
    for (const a of accs) {
      const arr = a?.profile?.eleves ?? [];
      for (const e of arr) {
        if (e && typeof e.id === 'number') {
          list.push({ id: e.id, prenom: e.prenom, nom: e.nom, photo: e.photo });
        }
      }
    }
    const map = new Map<number, Eleve>();
    for (const e of list) map.set(e.id, e);
    return Array.from(map.values());
  }, [loginData]);

  // URL absolue depuis //… ou http(s)…
  function absolutePhoto(src?: string) {
    if (!src) return undefined;
    if (src.startsWith('//')) return 'https:' + src;
    return src;
  }

  // Passe par notre proxy pour éviter CORP/CORS
  function proxiedPhoto(src?: string) {
    const abs = absolutePhoto(src);
    if (!abs) return undefined;
    if (abs.startsWith('http')) {
      return `/api/ed/img?u=${encodeURIComponent(abs)}`;
    }
    return abs;
  }

  async function selectEleve(eleve: Eleve) {
    try {
      // 1) ta logique existante : stocker l'élève en session, etc.
      sessionStorage.setItem('ed_selected_eleve_id', String(eleve?.id ?? eleve?.idEleve ?? ''));
      sessionStorage.setItem(
        'ed_selected_eleve_name',
        eleve?.prenom ? `${eleve.prenom} ${eleve.nom ?? ''}`.trim() : eleve?.nom ?? '',
      );
      if (eleve?.photo) sessionStorage.setItem('ed_selected_eleve_photo', eleve.photo);

      // 2) upsert Supabase (non bloquant pour l'UX si tu veux)
      await upsertSelectedEleve(eleve); // passe ed_account_id en 2e param si tu l'as
    } catch {}
    router.push('/dashboard');
  }

  // Si pas loggé → retour login
  useEffect(() => {
    if (token === null) return;
    if (!token) router.replace('/');
  }, [token, router]);

  return (
    <div className={styles.readable}>
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">Choisir un élève</h1>
              <p className="text-sm text-black/80">
                Sélectionne l’élève pour lequel afficher le tableau de bord.
              </p>
            </div>
            <Link href="/" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
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
                    <div className="h-24 w-24 rounded-full overflow-hidden border border-gray-300 bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={proxiedPhoto(e.photo) || '/placeholder-avatar.png'}
                        alt={e.prenom || 'Élève'}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="text-sm font-medium text-black">{e.prenom || 'Élève'}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
