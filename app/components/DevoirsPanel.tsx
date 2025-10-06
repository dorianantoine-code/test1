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

type DbDevoir = {
  ed_devoir_id: number;
  ed_eleve_id: number;
  due_date: string | null;
  matiere: string | null;
  code_matiere: string | null;
  a_faire: boolean | null;
  effectue: boolean | null;
  interrogation: boolean | null;
  documents_a_faire?: boolean | null;
  donne_le?: string | null;
  rendre_en_ligne?: boolean | null;
  last_sync_at?: string;
  coef_matiere?: number;
  coef_controle?: number;
  score?: number;
  date_realisation?: string | null;
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
  } catch {
    // ignore
  }

  return { token, eleveId };
}

/* ---- Menu d’action par ligne ---- */
function RowActionMenu({
  onMarkToday,
  onMarkYesterday,
  onMarkPrevious,
  onMarkNotDone,
}: {
  onMarkToday: () => void;
  onMarkYesterday: () => void;
  onMarkPrevious: () => void;
  onMarkNotDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="px-2 py-1 text-sm rounded-md border hover:bg-gray-50"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Actions"
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Actions devoir"
          className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg overflow-hidden z-10"
        >
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onMarkToday();
            }}
          >
            Marquer « Fait aujourd’hui »
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onMarkYesterday();
            }}
          >
            Marquer « Fait hier »
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => {
              setOpen(false);
              onMarkPrevious();
            }}
          >
            Marquer « Fait – date précédente »
          </button>
          <div className="h-px bg-gray-200" />
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-red-700"
            onClick={() => {
              setOpen(false);
              onMarkNotDone();
            }}
          >
            Remettre « Non effectué »
          </button>
        </div>
      )}
    </div>
  );
}

export default function DevoirsPanel() {
  const [{ token, eleveId }, setAuth] = useState(getTokenAndEleveId);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EdCdtResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastSyncedKeyRef = useRef<string | null>(null);

  const [dbDevoirs, setDbDevoirs] = useState<DbDevoir[]>([]);
  const [dbLoading, setDbLoading] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = () => setAuth(getTokenAndEleveId());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const disabled = useMemo(() => !token || !eleveId, [token, eleveId]);

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

  const normalized: EdCdtData | null = useMemo(() => {
    if (!payload) return null;
    const root =
      payload?.cahierDeTexte ??
      payload?.data?.cahierDeTexte ??
      payload?.data ??
      payload?.result ??
      payload;
    if (root && typeof root === 'object') return root as EdCdtData;
    return null;
  }, [payload]);

  useEffect(() => {
    if (!eleveId || !normalized) return;

    function hash(obj: unknown) {
      try {
        const str = JSON.stringify(obj);
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
          h = (h * 33) ^ str.charCodeAt(i);
        }
        return `${eleveId}:${(h >>> 0).toString(36)}`;
      } catch {
        return `${eleveId}:nohash`;
      }
    }

    const key = hash(normalized);
    if (lastSyncedKeyRef.current === key) return;

    let aborted = false;

    (async () => {
      try {
        setSyncError(null);
        const res = await fetch('/api/devoir/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eleveId,
            cdtData: normalized,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) {
          lastSyncedKeyRef.current = key;
        }
      } catch (e: any) {
        if (!aborted) setSyncError(e?.message || 'Erreur sync devoirs');
      }
    })();

    return () => {
      aborted = true;
    };
  }, [eleveId, normalized]);

  async function reloadFromDb() {
    if (!eleveId) return;
    setDbLoading(true);
    setDbError(null);
    try {
      const res = await fetch('/api/devoir/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eleveId, onlyFuture: true }),
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setDbDevoirs(json.items || []);
    } catch (e: any) {
      setDbError(e?.message || 'Erreur chargement devoirs DB');
    } finally {
      setDbLoading(false);
    }
  }

  useEffect(() => {
    let aborted = false;
    (async () => {
      if (!eleveId) return;
      if (!aborted) await reloadFromDb();
    })();
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eleveId, lastSyncedKeyRef.current]);

  function chip(v: any, color?: 'green' | 'red' | 'blue' | 'amber') {
    const base = 'inline-block px-2 py-0.5 text-xs rounded-full border';
    const cx =
      color === 'green'
        ? `${base} bg-green-50 border-green-200 text-green-700`
        : color === 'red'
        ? `${base} bg-red-50 border-red-200 text-red-700`
        : color === 'amber'
        ? `${base} bg-amber-50 border-amber-200 text-amber-700`
        : `${base} bg-blue-50 border-blue-200 text-blue-700`;
    return <span className={cx}>{String(v)}</span>;
  }

  async function updateDevoirAction(
    ed_devoir_id: number,
    action: 'today' | 'yesterday' | 'previous' | 'not_done'
  ) {
    if (!eleveId) return;

    // Optimistic UI: maj immédiate (et nullification date si not_done)
    setDbDevoirs((prev) =>
      prev.map((r) =>
        r.ed_devoir_id === ed_devoir_id
          ? {
              ...r,
              effectue: action === 'not_done' ? false : true,
              date_realisation: action === 'not_done' ? null : r.date_realisation ?? new Date().toISOString(),
            }
          : r
      )
    );

    try {
      const res = await fetch('/api/devoir/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ed_eleve_id: eleveId,
          ed_devoir_id,
          action,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      await reloadFromDb(); // réconcilie avec l'état DB
    } catch {
      await reloadFromDb(); // annule l'optimistic en cas d’erreur
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Ma fiche de travail du jour :</h2>
      </div>

      {disabled && (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            Impossible de charger les devoirs : <strong>token</strong> ou <strong>eleveId</strong>{' '}
            manquant(s).
          </p>
          <ul className="list-disc ml-5 mt-2 text-sm">
            <li>Assure-toi d’être connecté (token ED valide).</li>
            <li>Sélectionne un élève depuis la page dédiée.</li>
          </ul>
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

      {!disabled && !loading && !error && (
        <div className="rounded-lg border p-4">
          <div className="text-sm opacity-60 mb-2">Aperçu (ED / sync effectuée)</div>
          <div className="text-sm">Les données sont synchronisées en base à chaque affichage.</div>
        </div>
      )}

      {!disabled && (
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium">Prochains devoirs (depuis la base)</h3>
            {dbLoading && <div className="text-sm opacity-70">Chargement…</div>}
          </div>

          {dbError && (
            <div className="rounded-lg border p-3 text-red-600 text-sm">Erreur : {dbError}</div>
          )}

          {!dbError && !dbLoading && (!dbDevoirs || dbDevoirs.length === 0) && (
            <div className="rounded-lg border p-3 text-sm">Aucun devoir à venir.</div>
          )}

          {!dbError && !dbLoading && dbDevoirs && dbDevoirs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Matière</th>
                    <th className="py-2 pr-3">À faire</th>
                    <th className="py-2 pr-3">Contrôle</th>
                    <th className="py-2 pr-3">Score matière</th>
                    <th className="py-2 pr-3">Score contrôle</th>
                    <th className="py-2 pr-3">Score</th>
                    <th className="py-2 pr-0 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dbDevoirs.map((dv) => {
                    const aFaireUI = !Boolean(dv.effectue);

                    return (
                      <tr key={`${dv.ed_devoir_id}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{dv.due_date ?? '—'}</td>
                        <td className="py-2 pr-3">{dv.matiere ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {aFaireUI ? chip('Oui', 'amber') : chip('Non', 'green')}
                        </td>
                        <td className="py-2 pr-3">
                          {dv.interrogation ? chip('Oui', 'red') : chip('Non', 'blue')}
                        </td>
                        <td className="py-2 pr-3">{dv.coef_matiere ?? 1}</td>
                        <td className="py-2 pr-3">
                          {dv.coef_controle ?? (dv.interrogation ? 2 : 1)}
                        </td>
                        <td className="py-2 pr-3 font-semibold">{dv.score ?? 1}</td>

                        <td className="py-2 pr-0">
                          <div className="flex justify-end">
                            <RowActionMenu
                              onMarkToday={() => updateDevoirAction(dv.ed_devoir_id, 'today')}
                              onMarkYesterday={() => updateDevoirAction(dv.ed_devoir_id, 'yesterday')}
                              onMarkPrevious={() => updateDevoirAction(dv.ed_devoir_id, 'previous')}
                              onMarkNotDone={() => updateDevoirAction(dv.ed_devoir_id, 'not_done')}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
