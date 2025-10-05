// components/DevoirsPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type EdCdtItem = {
  matiere?: string;
  codeMatiere?: string;
  aFaire?: boolean;
  idDevoir: number;
  documentsAFaire?: boolean;
  donneLe?: string;
  effectue?: boolean;
  interrogation?: boolean;
  rendreEnLigne?: boolean;
};

type EdCdtData = Record<string, EdCdtItem[]>;
type EdCdtResponse = {
  code?: number;
  message?: string;
  data?: any;
  cahierDeTexte?: any;
  result?: any;
};

type DevoirRow = {
  ed_devoir_id: number;
  due_date: string; // "YYYY-MM-DD"
  matiere: string | null;
  code_matiere: string | null;
  a_faire: boolean | null;
  documents_a_faire: boolean | null;
  donne_le: string | null;
  effectue: boolean | null;
  interrogation: boolean | null;
  rendre_en_ligne: boolean | null;
};

function getTokenAndEleveId() {
  let token: string | null = null;
  let eleveId: number | null = null;
  try {
    token = sessionStorage.getItem('ed_token');
    const eleveIdStr = sessionStorage.getItem('ed_selected_eleve_id');
    if (eleveIdStr) eleveId = Number(eleveIdStr);

    if (!token) {
      const raw = sessionStorage.getItem('ed_login_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.token ?? parsed?.data?.token ?? null;
      }
    }

    if (!eleveId) {
      const rawEleve = sessionStorage.getItem('selected_eleve');
      if (rawEleve) {
        const parsedEleve = JSON.parse(rawEleve);
        eleveId =
          Number(parsedEleve?.ed_eleve_id ?? parsedEleve?.id ?? parsedEleve?.eleveId) || null;
      }
    }
  } catch {}
  return { token, eleveId };
}

function todayInParis(): string {
  const fmt = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function formatDateFR(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(dt);
  } catch {
    return dateStr;
  }
}

export default function DevoirsPanel() {
  const [{ token, eleveId }, setAuth] = useState(getTokenAndEleveId);

  // --- Etats existants (CDT + sync) ---
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EdCdtResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const lastCdtSyncSigRef = useRef<string | null>(null);
  const lastFicheUpsertRef = useRef<string | null>(null);

  // --- Nouveaux états : listing des prochains devoirs ---
  const [upcoming, setUpcoming] = useState<Record<string, DevoirRow[]>>({});
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0); // pour refetch après sync

  // suivre changements du storage
  useEffect(() => {
    const onStorage = () => setAuth(getTokenAndEleveId());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const disabled = useMemo(() => !token || !eleveId, [token, eleveId]);

  // A) Créer / MAJ la fiche du jour
  useEffect(() => {
    if (!eleveId) return;

    const jour = todayInParis();
    const key = `${eleveId}:${jour}`;
    if (lastFicheUpsertRef.current === key) return;

    let aborted = false;
    (async () => {
      try {
        const res = await fetch('/api/fiche/upsert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId, jour }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) lastFicheUpsertRef.current = key;
      } catch (e) {
        console.warn('Upsert fiche_devoir (jour) échoué:', e);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [eleveId]);

  // B) Charger le CDT via /api/ed/cdt (inchangé)
  useEffect(() => {
    let abort = false;

    async function load() {
      if (disabled) return;
      setLoading(true);
      setError(null);
      setPayload(null);

      try {
        const res = await fetch('/api/ed/cdt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, eleveId }),
          cache: 'no-store',
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const json: EdCdtResponse = await res.json();

        if (json?.code && json.code !== 200) {
          throw new Error(json.message || `Erreur ED code=${json.code}`);
        }

        if (!abort) setPayload(json);
      } catch (e: any) {
        if (!abort) setError(e?.message || 'Erreur de chargement des devoirs');
      } finally {
        if (!abort) setLoading(false);
      }
    }

    load();
    return () => {
      abort = true;
    };
  }, [token, eleveId, disabled]);

  // C) Normaliser l'objet pour la sync vers table devoir
  const normalized: Record<string, EdCdtItem[]> | null = useMemo(() => {
    if (!payload) return null;

    const candidates = [
      payload?.cahierDeTexte,
      payload?.data?.cahierDeTexte,
      payload?.data,
      payload?.result,
    ];

    const isDateKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);

    for (const cand of candidates) {
      if (cand && typeof cand === 'object') {
        const entries = Object.entries(cand).filter(([k]) => isDateKey(k));
        if (entries.length) {
          const out: Record<string, EdCdtItem[]> = {};
          for (const [date, val] of entries) {
            if (!Array.isArray(val)) {
              console.warn('CDT: valeur non-tableau pour la date', date, val);
            }
            out[date] = Array.isArray(val) ? (val as EdCdtItem[]) : [];
          }
          return out;
        }
      }
    }
    return null;
  }, [payload]);

  // D) Sync automatique vers table public.devoir
  useEffect(() => {
    if (!eleveId || !normalized) return;

    // signature stable triée (date + idDevoir + aFaire + effectue)
    const pairs: Array<[string, number, boolean | undefined, boolean | undefined]> = [];
    const dates = Object.keys(normalized).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    for (const date of dates) {
      const rawVal = normalized[date];
      const arr = Array.isArray(rawVal) ? rawVal : [];
      const items = arr
        .slice()
        .sort((a, b) => (Number(a?.idDevoir) || 0) - (Number(b?.idDevoir) || 0));
      for (const it of items) {
        const id = Number(it?.idDevoir) || 0;
        pairs.push([date, id, it?.aFaire, it?.effectue]);
      }
    }

    const sigStr = JSON.stringify(pairs);
    let h = 5381;
    for (let i = 0; i < sigStr.length; i++) h = (h * 33) ^ sigStr.charCodeAt(i);
    const syncSig = `${eleveId}:${(h >>> 0).toString(36)}`;

    if (lastCdtSyncSigRef.current === syncSig) return;

    let aborted = false;
    (async () => {
      try {
        setSyncError(null);
        const res = await fetch('/api/devoir/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId, cdtData: normalized }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) {
          lastCdtSyncSigRef.current = syncSig;
          // Déclencher un rafraîchissement de la liste "prochains devoirs"
          setRefreshKey((k) => k + 1);
        }
      } catch (e: any) {
        if (!aborted) setSyncError(e?.message || 'Erreur sync devoirs');
      }
    })();

    return () => {
      aborted = true;
    };
  }, [eleveId, normalized]);

  // E) Charger les prochains devoirs depuis notre nouvelle route
  useEffect(() => {
    if (!eleveId) return;

    let aborted = false;
    (async () => {
      try {
        setUpcomingLoading(true);
        setUpcomingError(null);

        const res = await fetch('/api/devoir/list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId /*, accountId: ??? optionnel */ }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

        const arr: DevoirRow[] = Array.isArray(json?.items) ? json.items : [];

        // Grouper par date
        const grouped: Record<string, DevoirRow[]> = {};
        for (const it of arr) {
          const k = it.due_date || '—';
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(it);
        }
        // Trier chaque groupe par matière puis id
        for (const k of Object.keys(grouped)) {
          grouped[k].sort((a, b) => {
            const ma = (a.matiere || '').localeCompare(b.matiere || '');
            if (ma !== 0) return ma;
            return (a.ed_devoir_id || 0) - (b.ed_devoir_id || 0);
          });
        }

        if (!aborted) setUpcoming(grouped);
      } catch (e: any) {
        if (!aborted) setUpcomingError(e?.message || 'Erreur chargement prochains devoirs');
      } finally {
        if (!aborted) setUpcomingLoading(false);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [eleveId, refreshKey]);

  // Rendu

  const upcomingDates = useMemo(
    () => Object.keys(upcoming).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    [upcoming],
  );

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Ma fiche de travail du jour :</h2>
        <div className="text-sm opacity-70">
          {eleveId ? `Élève #${eleveId}` : 'Élève non sélectionné'}
        </div>
      </div>

      {/* États CDT */}
      {disabled && (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            Impossible de charger les devoirs : <strong>token</strong> ou <strong>eleveId</strong>{' '}
            manquant(s).
          </p>
        </div>
      )}

      {!disabled && loading && <div className="rounded-lg border p-4">Chargement des devoirs…</div>}

      {!disabled && error && (
        <div className="rounded-lg border p-4 text-red-600">Erreur : {error}</div>
      )}

      {!disabled && !loading && syncError && (
        <div className="rounded-lg border p-3 text-red-600 text-sm">
          Synchronisation Supabase : {syncError}
        </div>
      )}

      {/* Joli rendu des prochains devoirs */}
      {!disabled && !loading && !upcomingLoading && upcomingDates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Prochains devoirs</h3>

          {upcomingDates.map((date) => (
            <div key={date} className="rounded-xl border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">
                  {formatDateFR(date)} <span className="opacity-60">({date})</span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full border">
                  {upcoming[date].length} devoir{upcoming[date].length > 1 ? 's' : ''}
                </span>
              </div>

              <ul className="space-y-2">
                {upcoming[date].map((d) => (
                  <li
                    key={`${date}-${d.ed_devoir_id}`}
                    className="flex items-start justify-between rounded-lg border px-3 py-2"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {d.matiere || d.code_matiere || 'Matière'}
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs opacity-80">
                        {d.a_faire ? (
                          <span className="px-2 py-0.5 rounded-full border">À faire</span>
                        ) : null}
                        {d.effectue ? (
                          <span className="px-2 py-0.5 rounded-full border">Fait</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full border">À faire</span>
                        )}
                        {d.interrogation ? (
                          <span className="px-2 py-0.5 rounded-full border">Interrogation</span>
                        ) : null}
                        {d.documents_a_faire ? (
                          <span className="px-2 py-0.5 rounded-full border">Documents</span>
                        ) : null}
                        {d.rendre_en_ligne ? (
                          <span className="px-2 py-0.5 rounded-full border">En ligne</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-xs opacity-60 text-right">
                      Donné le {d.donne_le ?? '—'}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!disabled && !loading && (upcomingLoading || upcomingDates.length === 0) && (
        <div className="rounded-lg border p-4 text-sm opacity-80">
          {upcomingLoading ? 'Chargement des prochains devoirs…' : 'Aucun devoir à venir.'}
        </div>
      )}
    </section>
  );
}
