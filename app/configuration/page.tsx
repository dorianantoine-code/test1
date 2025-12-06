// app/configuration/page.tsx
'use client';

import Link from 'next/link';
import styles from '../styles/readable.module.css';
import StudentHeader from '../components/ui/StudentHeader';
import { useEffect, useState } from 'react';

export default function ConfigurationPage() {
  const [darkMode, setDarkMode] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('prefers-dark-mode');
      if (stored) setDarkMode(stored === 'true');
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
                  Activer / désactiver le mode sombre (jour / nuit).
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <span className="text-sm font-medium">Mode sombre</span>
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
          </section>
        </div>
      </main>
    </div>
  );
}
