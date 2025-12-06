// app/configuration/page.tsx
'use client';

import Link from 'next/link';
import styles from '../styles/readable.module.css';
import StudentHeader from '../components/ui/StudentHeader';

export default function ConfigurationPage() {
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
        </div>
      </main>
    </div>
  );
}
