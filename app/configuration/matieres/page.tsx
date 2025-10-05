// app/configuration/matieres/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import StudentHeader from '../../components/ui/StudentHeader';
import styles from '../../styles/readable.module.css';

type MatiereItem = { code: string; label: string };
type Choix = 'peu' | 'normal' | 'beaucoup';

// Union & tri alpha
function unionMatieres(a: MatiereItem[], b: MatiereItem[]): MatiereItem[] {
  const map = new Map<string, MatiereItem>();
  for (const m of a) map.set(m.code, m);
  for (const m of b) if (!map.has(m.code)) map.set(m.code, m);
  return Array.from(map.values()).sort((x, y) =>
    x.label.localeCompare(y.label, 'fr', { sensitivity: 'base' }),
  );
}

export default function MatieresConfigPage() {
  const [token, setToken] = useState<string | null>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [matieres, setMatieres] = useState<MatiereItem[]>([]);
  const [selections, setSelections] = useState<Record<string, Choix>>({}); // valeur locale
  const [saving, setSaving] = useState<Record<string, boolean>>({}); // état "enregistrement…"
  const [saveErr, setSaveErr] = useState<Record<string, string | null>>({}); // erreur par matière
  const [savedAt, setSavedAt] = useState<Record<string, number>>({}); // timestamp "ok"

  // Récup token + élève
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      setToken(t);
      setEleveId(sid ? Number(sid) : null);
    } catch {}
  }, []);

  // Charger les matières + préférences déjà enregistrées
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!eleveId) return;
      setLoading(true);
      setError(null);
      try {
        // 1) matières détectées via table devoir
        const listReq = fetch('/api/matieres/list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId: Number(eleveId) }),
          cache: 'no-store',
        }).then(async (res) => {
          const json = await res.json();
          if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
          const items: MatiereItem[] = json.items || [];
          return items;
        });

        // 2) préférences déjà enregistrées
        const prefsReq = fetch('/api/matieres/prefs/list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId: Number(eleveId) }),
          cache: 'no-store',
        }).then(async (res) => {
          const json = await res.json();
          if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
          // items: [{ code, label, choix, score, updatedAt }]
          return (json.items || []) as Array<{ code: string; label: string; choix: Choix }>;
        });

        const [matieresA, prefs] = await Promise.all([listReq, prefsReq]);
        if (aborted) return;

        // Union: on ajoute aussi les matières présentes en prefs (si pas dans devoir)
        const matieresFromPrefs: MatiereItem[] = prefs.map((p) => ({
          code: p.code,
          label: p.label,
        }));
        const union = unionMatieres(matieresA, matieresFromPrefs);
        setMatieres(union);

        // Pré-remplir selections : "normal" par défaut, puis override avec prefs
        setSelections((prev) => {
          const next: Record<string, Choix> = { ...prev };
          for (const m of union) {
            if (!next[m.code]) next[m.code] = 'normal';
          }
          for (const p of prefs) {
            next[p.code] = p.choix;
          }
          return next;
        });
      } catch (e: any) {
        if (!aborted) setError(e?.message || 'Erreur lors du chargement des matières/préférences');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [eleveId]);

  function labelForChoix(c: Choix) {
    return c === 'peu'
      ? 'peu de temps'
      : c === 'beaucoup'
      ? 'beaucoup de temps'
      : 'un temps normal';
  }

  // Clic = set local + UPSERT
  async function onPick(code: string, label: string, choix: Choix) {
    // Optimistic UI
    setSelections((prev) => ({ ...prev, [code]: choix }));
    setSaving((p) => ({ ...p, [code]: true }));
    setSaveErr((p) => ({ ...p, [code]: null }));

    try {
      const res = await fetch('/api/matieres/prefs/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eleveId: Number(eleveId),
          codeMatiere: code,
          matiere: label,
          choix, // 'peu' | 'normal' | 'beaucoup'
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setSavedAt((p) => ({ ...p, [code]: Date.now() }));
    } catch (e: any) {
      setSaveErr((p) => ({ ...p, [code]: e?.message || 'Erreur sauvegarde' }));
    } finally {
      setSaving((p) => ({ ...p, [code]: false }));
    }
  }

  const hasData = useMemo(() => matieres.length > 0, [matieres]);

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

          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Configuration des matières</h1>
            <Link href="/configuration" className="text-sm underline opacity-75 hover:opacity-100">
              ← Retour configuration
            </Link>
          </div>

          <section className="rounded-2xl border p-6 space-y-4">
            <h2 className="text-lg font-medium">Temps passé par matière</h2>

            {!token || !eleveId ? (
              <div className="rounded-lg border p-4 text-sm">
                Impossible de charger : token ou élève non défini.
              </div>
            ) : loading ? (
              <div className="rounded-lg border p-4 text-sm">Chargement…</div>
            ) : error ? (
              <div className="rounded-lg border p-4 text-sm text-red-600">Erreur : {error}</div>
            ) : !hasData ? (
              <div className="rounded-lg border p-4 text-sm">
                Aucune matière détectée pour cet élève.
              </div>
            ) : (
              <div className="space-y-4">
                {matieres.map((m) => {
                  const current = (selections[m.code] || 'normal') as Choix;
                  const isSaving = !!saving[m.code];
                  const err = saveErr[m.code];
                  const okTs = savedAt[m.code];

                  return (
                    <div
                      key={m.code}
                      className="rounded-xl border p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex-1">
                        <div className="text-sm uppercase tracking-wide opacity-60">Matière</div>
                        <div className="text-base font-medium">{m.label}</div>

                        <p className="mt-2 text-sm md:text-base">
                          En <span className="font-semibold">{m.label}</span>, mes devoirs me
                          prennent <span className="font-semibold">{labelForChoix(current)}</span>.
                        </p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(['peu', 'normal', 'beaucoup'] as Choix[]).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => onPick(m.code, m.label, opt)}
                              disabled={isSaving}
                              className={[
                                'px-3 py-1.5 rounded-full border text-sm transition',
                                current === opt ? 'bg-black text-white' : 'hover:bg-black/5',
                                isSaving ? 'opacity-60 cursor-wait' : 'cursor-pointer',
                              ].join(' ')}
                              title="Cliquer pour enregistrer"
                            >
                              {opt === 'peu'
                                ? 'peu de temps'
                                : opt === 'normal'
                                ? 'un temps normal'
                                : 'beaucoup de temps'}
                            </button>
                          ))}
                        </div>

                        {isSaving && <div className="mt-2 text-xs opacity-70">Enregistrement…</div>}
                        {!!okTs && !isSaving && !err && (
                          <div className="mt-2 text-xs text-green-600">Enregistré ✔︎</div>
                        )}
                        {!!err && <div className="mt-2 text-xs text-red-600">Erreur : {err}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
