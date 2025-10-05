// app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../styles/readable.module.css';
import StudentHeader from '../components/ui/StudentHeader';
import DevoirsPanel from '../components/DevoirsPanel';
import CalculDispo from '../components/CalculDispo';

type LoginData = { account?: any; accounts?: any[]; token?: string };

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<LoginData | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [weekScore, setWeekScore] = useState<number | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      const sname = sessionStorage.getItem('ed_selected_eleve_name');
      const sphoto = sessionStorage.getItem('ed_selected_eleve_photo');
      setToken(t);
      setLoginData(d ? JSON.parse(d) : null);
      setSelectedId(sid ? Number(sid) : null);
      setSelectedName(sname || null);
      setSelectedPhoto(sphoto || null);
    } catch {}
  }, []);

  // Redirections
  useEffect(() => {
    if (token === null) return;
    if (!token) router.replace('/');
  }, [token, router]);

  useEffect(() => {
    if (selectedId === null) return;
    if (!selectedId) router.replace('/ed/eleves');
  }, [selectedId, router]);

  function absolutePhoto(src?: string | null) {
    if (!src) return undefined;
    if (src.startsWith('//')) return 'https:' + src;
    return src;
  }
  function proxiedPhoto(src?: string | null) {
    const abs = absolutePhoto(src || undefined);
    if (!abs) return undefined;
    if (abs.startsWith('http')) return `/api/ed/img?u=${encodeURIComponent(abs)}`;
    return abs;
  }

  function prettyPrintJson(obj: any) {
    if (!obj) return '';
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/"(.*?)":/g, '<span class="text-blue-400">"$1"</span>:')
      .replace(/: "(.*?)"/g, ': <span class="text-green-300">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="text-purple-300">$1</span>')
      .replace(/: (true|false)/g, ': <span class="text-orange-300">$1</span>');
  }

  const headerEleve = useMemo(() => {
    if (selectedId && selectedName) return `Élève ${selectedName} (#${selectedId})`;
    if (selectedId) return `Élève #${selectedId}`;
    return 'Dashboard';
  }, [selectedId, selectedName]);

  return (
    <div className={styles.readable}>
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <StudentHeader
            pages={[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/ed/agenda', label: 'EDT' },
              { href: '/ed/cdt', label: 'CDT' },
              { href: '/ed/eleves', label: 'Élèves' },
              { href: '/', label: 'Déconnexion' },
            ]}
          />

          {!token ? (
            <div className="rounded-2xl border p-6">
              <p className="mb-3">
                Aucun <code>token</code> en session. Connecte-toi d’abord.
              </p>
              <Link href="/" className="inline-block rounded-xl bg-black text-white px-4 py-2">
                Aller à la page de connexion
              </Link>
            </div>
          ) : (
            <>
              {/* Bloc Configurer mon compte + bouton Configurer ma fiche */}
              <section className="rounded-2xl border p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-medium">
                    Besoin d'ajouter des créneau perso à mon agenda (sport, musiqiue, etc..) ou
                    d'affiner le temps que je passe par matière ?{' '}
                  </h2>

                  {/* 👉 Nouveau bouton */}
                  <Link
                    href="/configuration"
                    className="inline-flex items-center rounded-xl bg-black text-white px-4 py-2 hover:opacity-90"
                  >
                    Je configure ma fiche
                  </Link>
                </div>
              </section>
              {weekScore !== null && (
                <div className="rounded-xl border p-4 bg-gray-50">
                  <div className="text-sm opacity-70">Score dispo (jusqu’au jeudi)</div>
                  <div className="text-xl font-semibold">{weekScore}</div>
                </div>
              )}

              {/* Passe le callback pour récupérer la valeur */}
              <CalculDispo onAggregateScore={(score) => setWeekScore(score)} />
              {/* Liste les devoirs */}
              <DevoirsPanel />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
