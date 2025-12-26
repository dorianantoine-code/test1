// app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from '../styles/readable.module.css';
import StudentHeader from '../components/ui/StudentHeader';
import DevoirsPanel from '../components/DevoirsPanel';
import CalculDispo from '../components/CalculDispo';
/* Exemple dans ton Dashboard/DevoirsPanel */

type LoginData = { account?: any; accounts?: any[]; token?: string };

function findEleveById(loginData: any, id: number | null) {
  if (!id || !loginData) return null;
  const root = loginData?.data ?? loginData;
  const accounts: any[] = root?.accounts ?? [];
  for (const a of accounts) {
    const arr: any[] = a?.profile?.eleves ?? [];
    for (const e of arr) {
      if (Number(e?.id) === Number(id)) return e;
    }
  }
  return null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<LoginData | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedEtab, setSelectedEtab] = useState<string | null>(null);
  const [weekScore, setWeekScore] = useState<number | null>(null);
  const [devoirJson, setDevoirJson] = useState<any | null>(null);
  const [devoirJsonError, setDevoirJsonError] = useState<string | null>(null);
  const [devoirJsonLoading, setDevoirJsonLoading] = useState(false);
  const [edRawJson, setEdRawJson] = useState<any | null>(null);
  const [edRawError, setEdRawError] = useState<string | null>(null);
  const [edRawLoading, setEdRawLoading] = useState(false);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      const sname = sessionStorage.getItem('ed_selected_eleve_name');
      const sphoto = sessionStorage.getItem('ed_selected_eleve_photo');
      const setab = sessionStorage.getItem('ed_selected_eleve_etablissement');
      setToken(t);
      setLoginData(d ? JSON.parse(d) : null);
      setSelectedId(sid ? Number(sid) : null);
      setSelectedName(sname || null);
      setSelectedPhoto(sphoto || null);
      setSelectedEtab(setab || null);
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

  // Si mode debug activé, redirige vers /dashboard-debug
  useEffect(() => {
    try {
      const dbg = localStorage.getItem('prefers-debug-mode');
      if (dbg === 'true') {
        router.replace('/dashboard-debug');
      }
    } catch {}
  }, [router]);

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

  const selectedElevePayload = useMemo(
    () => findEleveById(loginData, selectedId),
    [loginData, selectedId],
  );

  // complète l'établissement depuis le payload élève si dispo
  useEffect(() => {
    const eleve: any = selectedElevePayload;
    const fromPayload =
      eleve?.idEtablissement ||
      eleve?.etablissement?.id ||
      eleve?.etablissement ||
      eleve?.nomEtablissement ||
      null;
    if (fromPayload) {
      setSelectedEtab(String(fromPayload));
      try {
        sessionStorage.setItem('ed_selected_eleve_etablissement', String(fromPayload));
      } catch {}
    }
  }, [selectedElevePayload]);

  // Debug JSON des devoirs (source Supabase après merge ED)
  useEffect(() => {
    let aborted = false;
    async function loadDevoirsJson() {
      if (!selectedId) return;
      setDevoirJsonLoading(true);
      setDevoirJsonError(null);
      try {
        const res = await fetch('/api/devoir/list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            eleveId: selectedId,
            etablissement: selectedEtab ?? undefined,
            onlyFuture: false,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        if (!aborted) setDevoirJson(json);
      } catch (e: any) {
        if (!aborted) setDevoirJsonError(e?.message || 'Erreur chargement devoirs (debug)');
      } finally {
        if (!aborted) setDevoirJsonLoading(false);
      }
    }
    loadDevoirsJson();
    return () => {
      aborted = true;
    };
  }, [selectedId, selectedEtab]);

  // Debug JSON brut ED (avant merge Supabase)
  useEffect(() => {
    let aborted = false;
    async function loadEdRaw() {
      if (!selectedId || !token) return;
      setEdRawLoading(true);
      setEdRawError(null);
      try {
        const res = await fetch('/api/ed/cdt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            token,
            eleveId: selectedId,
            etablissement: selectedEtab ?? undefined,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.message || `HTTP ${res.status}`);
        }
        if (!aborted) setEdRawJson(json);
      } catch (e: any) {
        if (!aborted) setEdRawError(e?.message || 'Erreur chargement ED brut');
      } finally {
        if (!aborted) setEdRawLoading(false);
      }
    }
    loadEdRaw();
    return () => {
      aborted = true;
    };
  }, [selectedId, token, selectedEtab]);

  return (
    <div className={styles.readable}>
      <main className="min-h-screen p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-6">
          <StudentHeader
            pages={[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/ed/agenda', label: 'EDT' },
              { href: '/ed/cdt', label: 'CDT' },
              { href: '/configuration', label: 'Configuration' },
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
              {/* Liste les devoirs (uniquement la fiche de travail sur le dashboard) */}
              <DevoirsPanel showProchains={false} showFiche />

              {/* Debug: payload élève sélectionné */}
              <section className="rounded-2xl border p-4 space-y-2">
                <h3 className="text-lg font-medium text-black">Données élève (JSON)</h3>
                <div className="text-xs text-gray-700">
                  {selectedElevePayload ? (
                    <pre className="overflow-auto rounded-xl bg-gray-900 text-gray-100 p-3">
                      {JSON.stringify(selectedElevePayload, null, 2)}
                    </pre>
                  ) : (
                    <span>Données élève introuvables dans la session.</span>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
