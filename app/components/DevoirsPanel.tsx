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
  etablissement?: string | null;
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
  let etablissement: string | null = null;

  try {
    token = sessionStorage.getItem('ed_token');
    const eleveIdStr = sessionStorage.getItem('ed_selected_eleve_id');
    etablissement = sessionStorage.getItem('ed_selected_eleve_etablissement');
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
        etablissement =
          etablissement ||
          parsedEleve?.etablissement?.nom ||
          parsedEleve?.etablissement ||
          parsedEleve?.nomEtablissement ||
          null;
      }
    }

    // fallback: chercher l'établissement dans login_data pour l'élève sélectionné
    if ((!etablissement || etablissement === '') && eleveId) {
      try {
        const raw = sessionStorage.getItem('ed_login_data');
        if (raw) {
          const login = JSON.parse(raw);
          const root = login?.data ?? login;
          const accs: any[] = root?.accounts ?? [];
          for (const a of accs) {
            const arr = a?.profile?.eleves ?? [];
            for (const e of arr) {
              if (Number(e?.id) === eleveId) {
                etablissement =
                  e?.etablissement?.nom ??
                  e?.etablissement ??
                  e?.nomEtablissement ??
                  a?.etablissement?.nom ??
                  a?.etablissement ??
                  etablissement;
              }
            }
          }
        }
      } catch {}
    }
  } catch {
    // ignore
  }

  return { token, eleveId, etablissement };
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
          className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-lg overflow-hidden z-10 text-gray-800"
        >
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
            onClick={() => {
              setOpen(false);
              onMarkToday();
            }}
          >
            Marquer « Fait aujourd’hui »
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
            onClick={() => {
              setOpen(false);
              onMarkYesterday();
            }}
          >
            Marquer « Fait hier »
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800"
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

type Props = {
  onAggregateScore?: (score: number, from: string, to: string) => void;
  showProchains?: boolean;
  showFiche?: boolean;
};

export default function DevoirsPanel({
  onAggregateScore,
  showProchains = true,
  showFiche = true,
}: Props) {
  const [{ token, eleveId, etablissement }, setAuth] = useState(getTokenAndEleveId);
  const [ficheScore, setFicheScore] = useState<number | null>(null);
  const [ficheLabel, setFicheLabel] = useState<string | null>(null);
  const [ficheId, setFicheId] = useState<number | null>(null);
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

  // Récupère le score de fiche depuis CalculDispo (stocké en sessionStorage)
  useEffect(() => {
    function loadScore() {
      try {
        const lbl = sessionStorage.getItem('calcdispo_day_label') || null;
        const scoreStr = sessionStorage.getItem('calcdispo_day_score');
        const val = scoreStr ? parseFloat(scoreStr) : NaN;
        if (!Number.isNaN(val)) setFicheScore(val);
        else setFicheScore(null);
        setFicheLabel(lbl);
      } catch {
        setFicheScore(null);
        setFicheLabel(null);
      }
    }
    loadScore();
    const onStorage = () => loadScore();
    window.addEventListener('storage', onStorage);
    const timer = window.setInterval(loadScore, 1200);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    };
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
          cache: 'no-store',
          body: JSON.stringify({ token, eleveId, etablissement }),
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
          cache: 'no-store',
          body: JSON.stringify({
            eleveId,
            etablissement,
            cdtData: normalized,
          }),
        });
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          /* ignore parse errors below */
        }
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) {
          lastSyncedKeyRef.current = key;
          await reloadFromDb(); // rafraîchit Supabase avec l'état ED
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
        body: JSON.stringify({ eleveId, etablissement, onlyFuture: true }),
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

  // Helpers pour la colonne "Fiche" (zone FICHE DEVOIR)
  function parisYMD(date: Date) {
    const fmt = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  }
  function toParisYMD(value?: string | null) {
    if (!value) return null;
    // format dd/mm/yyyy
    const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const mFr = value.match(fr);
    let d: Date | null = null;
    if (mFr) {
      const [, dd, mm, yyyy] = mFr;
      d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
    } else {
      d = new Date(value);
    }
    if (Number.isNaN(d.getTime())) return null;
    return parisYMD(d);
  }
  function parisShiftYMD(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return parisYMD(d);
  }
  function isFicheGreen(dv: DbDevoir) {
    const tomorrow = parisShiftYMD(1);
    const yesterday = parisShiftYMD(-1);
    const isSunday =
      new Date().toLocaleDateString('en-US', {
        timeZone: 'Europe/Paris',
        weekday: 'short',
      }) === 'Sun';
    const today = parisShiftYMD(0);
    const dueYmd = toParisYMD(dv.due_date ?? undefined);
    const realYmd = toParisYMD(dv.date_realisation ?? undefined);

    // Règle 1 : non effectué, à faire = oui, échéance = demain
    const aFaireOui = dv.a_faire !== false; // null/undefined => considérer "oui"
    if (!dv.effectue && aFaireOui && dueYmd && tomorrow && dueYmd === tomorrow) return true;

    // Règle 2 : dimanche, déjà effectué hier (samedi) ou aujourd'hui
    if (isSunday && dv.effectue && realYmd) {
      if ((yesterday && realYmd === yesterday) || (today && realYmd === today)) return true;
    }

    return false;
  }

  // Tri commun (date croissante puis score croissant)
  const sortedDevoirs = useMemo(() => {
    const norm = (s?: string | null) => toParisYMD(s ?? undefined) ?? '9999-12-31';
    return [...dbDevoirs].sort((a, b) => {
      const da = norm(a.due_date);
      const db = norm(b.due_date);
      if (da !== db) return da.localeCompare(db);
      const sa = Number(a.score ?? 1);
      const sb = Number(b.score ?? 1);
      return sb - sa; // score décroissant à date égale
    });
  }, [dbDevoirs]);

  // Calcul des bulles vertes + score restant (zone FICHE DEVOIR)
  function computeFicheFlags() {
    const greenIds = new Set<number>();
    if (!sortedDevoirs || sortedDevoirs.length === 0) {
      return { greenIds, remaining: ficheScore ?? 0 };
    }

    // 1) verts de base
    let sumBase = 0;
    for (const dv of sortedDevoirs) {
      if (isFicheGreen(dv)) {
        greenIds.add(dv.ed_devoir_id);
        sumBase += Number(dv.score ?? 1);
      }
    }

    let remaining = Math.max((ficheScore ?? 0) - sumBase, 0);

    // 2) compléter avec les premières croix rouges tant qu'il reste du score
    if (remaining > 0) {
      for (const dv of sortedDevoirs) {
        if (greenIds.has(dv.ed_devoir_id)) continue;
        const lineScore = Number(dv.score ?? 1);
        greenIds.add(dv.ed_devoir_id);
        remaining = Math.max(remaining - lineScore, 0);
        if (remaining <= 0) break;
      }
    }

    return { greenIds, remaining };
  }

  const ficheFlags = useMemo(() => computeFicheFlags(), [dbDevoirs, ficheScore]);
  const ficheDevoirs = useMemo(
    () => sortedDevoirs.filter((dv) => ficheFlags.greenIds.has(dv.ed_devoir_id)),
    [sortedDevoirs, ficheFlags.greenIds],
  );
  const controlesACommencer = useMemo(
    () =>
      sortedDevoirs.filter(
        (dv) =>
          !ficheFlags.greenIds.has(dv.ed_devoir_id) &&
          dv.interrogation === true &&
          dv.a_faire !== false,
      ),
    [sortedDevoirs, ficheFlags.greenIds],
  );

  async function updateDevoirAction(
    ed_devoir_id: number,
    action: 'today' | 'yesterday' | 'previous' | 'not_done',
  ) {
    if (!eleveId) return;

    // Optimistic UI: maj immédiate (et nullification date si not_done)
    setDbDevoirs((prev) =>
      prev.map((r) =>
        r.ed_devoir_id === ed_devoir_id
          ? {
              ...r,
              effectue: action === 'not_done' ? false : true,
              date_realisation:
                action === 'not_done' ? null : r.date_realisation ?? new Date().toISOString(),
            }
          : r,
      ),
    );

    try {
      const res = await fetch('/api/devoir/update', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ed_eleve_id: eleveId,
          ed_devoir_id,
          action,
          etablissement,
          token,
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

  // === Fiche de devoir du jour / week-end ===
  function todayParisYMD() {
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

  function weekendAnchor(dateYMD: string) {
    const [y, m, d] = dateYMD.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const wd = dt.getUTCDay(); // 0=dim..6=sam
    if (wd === 6) {
      // samedi -> lui-même
      return dateYMD;
    }
    if (wd === 0) {
      // dimanche -> samedi précédent
      const sat = new Date(dt);
      sat.setUTCDate(dt.getUTCDate() - 1);
      return sat.toISOString().slice(0, 10);
    }
    return dateYMD;
  }

  const lastEnsuredRef = useRef<string | null>(null);
  useEffect(() => {
    let aborted = false;
    async function ensureFiche() {
      if (!eleveId || ficheScore === null) return;
      const today = todayParisYMD();
      const anchor = weekendAnchor(today);
      const key = `${eleveId}|${anchor}|${etablissement ?? ''}`;
      if (lastEnsuredRef.current === key) return;
      try {
        const res = await fetch('/api/fiche/upsert', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ eleveId, jour: anchor, etablissement, score: ficheScore }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) {
          console.warn('[DevoirsPanel] ensure fiche_devoir error', json?.error || res.status);
          return;
        }
        if (!aborted) {
          lastEnsuredRef.current = key;
          setFicheId(json?.fiche?.id ?? json?.fiche?.[0]?.id ?? null);
        }
      } catch (e: any) {
        console.warn('[DevoirsPanel] ensure fiche_devoir fail', e?.message || e);
      }
    }
    ensureFiche();
    return () => {
      aborted = true;
    };
  }, [eleveId, etablissement, ficheScore]);

  // Synchronise les associations fiche_devoir <-> devoirs à bulles vertes
  useEffect(() => {
    async function syncLinks() {
      if (!eleveId || !ficheId) return;
      try {
        const ids = Array.from(ficheFlags.greenIds);
        await fetch('/api/fiche/sync-devoirs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            ficheId,
            eleveId,
            etablissement,
            devoirIds: ids,
          }),
        });
      } catch (e) {
        console.warn('[DevoirsPanel] sync fiche links failed', e);
      }
    }
    syncLinks();
  }, [ficheId, ficheFlags.greenIds, eleveId, etablissement]);

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

      {!disabled && showProchains && (
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

      {/* cette zone s'appelle FICHE DEVOIR*/}
      {!disabled && showFiche && (
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium flex items-center gap-2">
              Ma fiche de travail
              {ficheScore !== null && (
                <span className="text-sm text-gray-700">
                  Score: <span className="font-semibold">{ficheScore.toFixed(2)}</span>
                </span>
              )}
              {ficheLabel && <span className="text-xs text-gray-500">({ficheLabel})</span>}
              <span className="text-xs text-gray-500">
                (restant: {Math.max(ficheFlags.remaining, 0).toFixed(2)})
              </span>
            </h3>
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
                    <th className="py-2 pr-3">Fiche</th>
                    <th className="py-2 pr-0 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDevoirs.map((dv) => {
                    const aFaireUI = !Boolean(dv.effectue);
                    const isGreen = ficheFlags.greenIds.has(dv.ed_devoir_id);

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
                        <td className="py-2 pr-3">
                          {isGreen ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <span className="text-lg leading-none">●</span>
                              <span className="text-xs text-gray-600">
                                {dv.date_realisation ? toParisYMD(dv.date_realisation) : '—'}
                              </span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-600">
                              <span className="text-lg leading-none">✕</span>
                              <span className="text-xs text-gray-600">
                                {dv.date_realisation ? toParisYMD(dv.date_realisation) : '—'}
                              </span>
                            </span>
                          )}
                        </td>

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

      {/* Bloc autonome : Aujourd'hui je travaille sur */}
      {!disabled && showFiche && (
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-semibold">Aujourd&apos;hui je travaille sur :</h4>
          </div>
          {ficheDevoirs.length === 0 ? (
            <div className="rounded-lg border p-3 text-sm">Aucun devoir associé à la fiche.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Matière</th>
                    <th className="py-2 pr-3">Déjà fait</th>
                    <th className="py-2 pr-3">Contrôle</th>
                    <th className="py-2 pr-0 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ficheDevoirs.map((dv) => {
                    const dejaFait = Boolean(dv.effectue);
                    return (
                      <tr key={`fiche-${dv.ed_devoir_id}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{dv.due_date ?? '—'}</td>
                        <td className="py-2 pr-3">{dv.matiere ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {dejaFait ? chip('Oui', 'green') : chip('Non', 'amber')}
                        </td>
                        <td className="py-2 pr-3">
                          {dv.interrogation ? chip('Oui', 'red') : chip('Non', 'blue')}
                        </td>
                        <td className="py-2 pr-0">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className={`w-36 px-3 py-1 text-sm rounded-md border transition ${
                                dejaFait
                                  ? 'border-green-700 text-green-800 bg-white hover:bg-green-50'
                                  : 'border-gray-600 text-black bg-white hover:bg-gray-100'
                              }`}
                              onClick={() =>
                                updateDevoirAction(dv.ed_devoir_id, dejaFait ? 'not_done' : 'today')
                              }
                            >
                              {dejaFait ? 'Marquer non fait' : 'Marquer fait'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {controlesACommencer.length > 0 && (
            <div className="mt-6">
              <h4 className="text-md font-semibold mb-3">
                et si j&apos;ai le temps je commence à préparer :
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Matière</th>
                      <th className="py-2 pr-3">Déjà fait</th>
                      <th className="py-2 pr-3">Contrôle</th>
                      <th className="py-2 pr-0 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlesACommencer.map((dv) => {
                      const dejaFait = Boolean(dv.effectue);
                      return (
                        <tr key={`prep-${dv.ed_devoir_id}`} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{dv.due_date ?? '—'}</td>
                          <td className="py-2 pr-3">{dv.matiere ?? '—'}</td>
                          <td className="py-2 pr-3">
                            {dejaFait ? chip('Oui', 'green') : chip('Non', 'amber')}
                          </td>
                          <td className="py-2 pr-3">
                            {dv.interrogation ? chip('Oui', 'red') : chip('Non', 'blue')}
                          </td>
                          <td className="py-2 pr-0">
                            <div className="flex justify-end">
                              <button
                                type="button"
                                className={`w-36 px-3 py-1 text-sm rounded-md border transition ${
                                  dejaFait
                                    ? 'border-green-700 text-green-800 bg-white hover:bg-green-50'
                                    : 'border-gray-600 text-black bg-white hover:bg-gray-100'
                                }`}
                                onClick={() =>
                                  updateDevoirAction(dv.ed_devoir_id, dejaFait ? 'not_done' : 'today')
                                }
                              >
                                {dejaFait ? 'Marquer non fait' : 'Marquer fait'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
