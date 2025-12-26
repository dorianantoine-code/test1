// app/configuration/page.tsx
'use client';

import Link from 'next/link';
import styles from '../styles/readable.module.css';
import StudentHeader from '../components/ui/StudentHeader';
import { useEffect, useMemo, useState } from 'react';

export default function ConfigurationPage() {
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [etablissement, setEtablissement] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [vitesse, setVitesse] = useState<number | null>(null);
  const [vitesseLoading, setVitesseLoading] = useState(false);
  const [vitesseSaving, setVitesseSaving] = useState(false);
  const [vitesseError, setVitesseError] = useState<string | null>(null);

  useEffect(() => {
    // élève et étab depuis la session
    try {
      const idStr = sessionStorage.getItem('ed_selected_eleve_id');
      const etab = sessionStorage.getItem('ed_selected_eleve_etablissement');
      const acc = sessionStorage.getItem('ed_account_id');
      if (idStr) setEleveId(Number(idStr));
      if (etab) setEtablissement(etab);
      if (acc) setAccountId(Number(acc));
      // fallback : chercher dans ed_login_data
      if (!acc) {
        const raw = sessionStorage.getItem('ed_login_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          const accId =
            parsed?.data?.accounts?.[0]?.id ??
            parsed?.accounts?.[0]?.id ??
            parsed?.data?.account?.id ??
            null;
          if (accId) {
            setAccountId(Number(accId));
            sessionStorage.setItem('ed_account_id', String(accId));
          }
        }
      }
    } catch {}

    try {
      const stored = localStorage.getItem('prefers-dark-mode');
      if (stored) setDarkMode(stored === 'true');
      const dbg = localStorage.getItem('prefers-debug-mode');
      if (dbg) setDebugMode(dbg === 'true');
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('prefers-dark-mode', String(darkMode));
      const root = document.documentElement;
      root.classList.toggle('dark', darkMode);
      // force les couleurs du thème global
      if (darkMode) {
        root.style.setProperty('--background', '#0a0a0a');
        root.style.setProperty('--foreground', '#ededed');
        root.style.colorScheme = 'dark';
      } else {
        root.style.setProperty('--background', '#ffffff');
        root.style.setProperty('--foreground', '#171717');
        root.style.colorScheme = 'light';
      }
    } catch {}
  }, [darkMode]);

  // persiste le mode debug (pour un usage ultérieur côté client)
  useEffect(() => {
    try {
      localStorage.setItem('prefers-debug-mode', String(debugMode));
    } catch {}
  }, [debugMode]);

  // Charger les prefs compte (dark/debug)
  useEffect(() => {
    let aborted = false;
    async function loadPrefs() {
      if (!accountId) return;
      try {
        const res = await fetch('/api/compte/prefs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountId, fetchOnly: true }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
        if (aborted) return;
        if (typeof json?.data?.pref_dark_mode === 'boolean') setDarkMode(json.data.pref_dark_mode);
        if (typeof json?.data?.pref_debug_mode === 'boolean') setDebugMode(json.data.pref_debug_mode);
      } catch (e) {
        console.warn('[config] load prefs compte', e);
      }
    }
    loadPrefs();
    return () => {
      aborted = true;
    };
  }, [accountId]);

  // Sauvegarde prefs compte
  useEffect(() => {
    let abort = false;
    async function savePrefs() {
      if (!accountId) return;
      try {
        const res = await fetch('/api/compte/prefs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ accountId, darkMode, debugMode }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) throw new Error(json?.error || `HTTP ${res.status}`);
      } catch (e) {
        if (!abort) console.warn('[config] save prefs compte', e);
      }
    }
    savePrefs();
    return () => {
      abort = true;
    };
  }, [accountId, darkMode, debugMode]);

  const vitesseLabel = useMemo(() => {
    if (vitesse === 1) return 'Très lent';
    if (vitesse === 2) return 'Normal';
    if (vitesse === 3) return 'Très rapide';
    return 'Non défini';
  }, [vitesse]);

  // Charger la vitesse depuis Supabase
  useEffect(() => {
    let aborted = false;
    async function load() {
      if (!eleveId) return;
      setVitesseLoading(true);
      setVitesseError(null);
      try {
        const res = await fetch('/api/eleve/vitesse', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ eleveId, etablissement }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `HTTP ${res.status}`);
        }
        if (!aborted) setVitesse(json.value ?? null);
      } catch (e: any) {
        if (!aborted) setVitesseError(e?.message || 'Erreur de chargement');
      } finally {
        if (!aborted) setVitesseLoading(false);
      }
    }
    load();
    return () => {
      aborted = true;
    };
  }, [eleveId, etablissement]);

  async function saveVitesse() {
    if (!eleveId || vitesse == null) return;
    setVitesseSaving(true);
    setVitesseError(null);
    try {
      const res = await fetch('/api/eleve/vitesse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          eleveId,
          etablissement,
          coef: vitesse === 1 ? 'tres_lent' : vitesse === 2 ? 'normal' : 'tres_rapide',
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    } catch (e: any) {
      setVitesseError(e?.message || 'Erreur sauvegarde');
    } finally {
      setVitesseSaving(false);
    }
  }

  // Auto-save quand la valeur change (et élève présent)
  useEffect(() => {
    if (!eleveId || vitesse == null) return;
    saveVitesse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitesse, eleveId, etablissement]);

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


          {/* Zone 1 : Config agenda perso */}
          <section className="rounded-2xl border p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Mon planning personnel</h2>
              <Link
                href="/configuration/agenda"
                className="inline-flex items-center rounded-xl bg-black text-white px-4 py-2 hover:opacity-90"
              >
                Je configure
              </Link>
            </div>
            <p className="text-sm opacity-80">
              Avec mes créneaux de sports, musique, soutien scolaire ou même de chill..
            </p>
          </section>

          {/* Zone 2 : Config matières */}
          <section className="rounded-2xl border p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Configurer mes matières</h2>
              <Link
                href="/configuration/matieres"
                className="inline-flex items-center rounded-xl bg-black text-white px-4 py-2 hover:opacity-90"
              >
                Je personnalise
              </Link>
            </div>
            <p className="text-sm opacity-80">
              Le temps que je dois bosser pour chaque matière. Je galère et j'ai besoin de temps sur certaines et je vais super vite sur d'autre..
            </p>
          </section>

          {/* Zone 3 : Paramètres généraux */}
          <section className="rounded-2xl border p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Paramètres généraux</h2>
                <p className="text-sm opacity-80">
                  Activer / désactiver le mode sombre (jour / nuit) et le mode debug.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mode sombre</span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setDarkMode((v) => !v)}
                    className={`relative w-12 h-6 rounded-full transition ${
                      darkMode ? 'bg-black' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transform transition ${
                        darkMode ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Mode debug</span>
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setDebugMode((v) => !v)}
                    className={`relative w-12 h-6 rounded-full transition ${
                      debugMode ? 'bg-black' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transform transition ${
                        debugMode ? 'translate-x-6' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>
              </div>
            </div>
          </section>

          {/* Zone 4 : Vitesse de travail */}
          <section className="rounded-2xl border p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">Vitesse de travail</h2>
                <p className="text-sm opacity-80">Choisis ton rythme : très lent, normal, très rapide.</p>
              </div>
              {!eleveId && (
                <span className="text-xs text-red-600">Aucun élève sélectionné</span>
              )}
            </div>

            {vitesseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {vitesseError}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm opacity-70">Très lent</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={1}
                  value={vitesse ?? 2}
                  disabled={!eleveId || vitesseLoading}
                  onChange={(e) => setVitesse(Number(e.target.value))}
                  className="flex-1 accent-black"
                />
                <span className="text-sm opacity-70">Très rapide</span>
              </div>
              <div className="text-sm">
                Valeur actuelle : <span className="font-semibold">{vitesseLabel}</span>
                {vitesseLoading && <span className="ml-2 text-xs opacity-70">Chargement…</span>}
                {vitesseSaving && !vitesseLoading && (
                  <span className="ml-2 text-xs opacity-70">Sauvegarde…</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
