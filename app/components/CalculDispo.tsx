// app/components/CalculDispo.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type EdtItem = {
  id: number;
  typeCours?: string; // COURS | PERMANENCE | CONGE ...
  start_date: string; // "YYYY-MM-DD HH:mm"
  end_date: string; // "YYYY-MM-DD HH:mm"
  [k: string]: any;
};

type EdtResponse = {
  ok?: boolean;
  status?: number;
  data?: any;
};

type AgendaPersoItem = {
  id: number;
  ed_eleve_id: number;
  ed_account_id: number;
  event_type: 'Sport' | 'Musique' | 'Cours particulier' | 'Autres';
  days: number[]; // 1=lundi..7=dimanche
  note?: string | null;
};

type Row = {
  date: string; // YYYY-MM-DD
  endTimeStr: string | null;
  scoreBase: number; // 3 / 2 / 1.5 / 1
  scorePerso: number; // -1 or 0
  scoreTotal: number; // scoreBase + scorePerso
  conge: boolean;
};

function getTokenAndEleveId() {
  let token: string | null = null;
  let eleveId: number | null = null;
  try {
    token = sessionStorage.getItem('ed_token');
    const sid = sessionStorage.getItem('ed_selected_eleve_id');
    if (sid) eleveId = Number(sid);
  } catch {}
  return { token, eleveId };
}

function ymd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Convert "YYYY-MM-DD HH:mm" to minutes since midnight
function toMinutes(str: string): number | null {
  // robust parsing
  if (!str) return null;
  const [d, hm] = str.split(' ');
  if (!hm) return null;
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Jour de semaine 1..7 (1=lundi ... 7=dimanche)
// Utilise 12:00 locale pour éviter les surprises de fuseau.
function weekday1to7(dateYMD: string): number {
  const dt = new Date(`${dateYMD}T12:00:00`);
  const js = dt.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1..7
}

// Extrait la dernière heure de fin par journée (en excluant PERMANENCE) et
// détecte les jours CONGE. Retourne un objet { [date]: { end: 'HH:mm' | null, conge: boolean } }
function extractDailyInfo(raw: any): Record<string, { end: string | null; conge: boolean }> {
  console.log('[CalculDispo] extractDailyInfo: raw keys =', Object.keys(raw || {}));

  // Trouver un tableau de séances quelque part dans la réponse
  let arr: EdtItem[] = [];

  // cas 1 : réponse directe
  if (Array.isArray(raw)) arr = raw as EdtItem[];

  // cas 2 : { data: [...] }
  if (!arr.length && Array.isArray(raw?.data)) arr = raw.data as EdtItem[];

  // cas 3 : { code, token, data: [...] } (payload ED « brut »)
  if (!arr.length && raw?.data && Array.isArray(raw?.data)) arr = raw.data as EdtItem[];

  // Si toujours rien => abandon
  if (!arr.length) {
    console.log('[CalculDispo] format inattendu (pas de .data array) -> aucun calcul');
    return {};
  }

  // Construire un map par date
  const byDate = new Map<string, { ends: number[]; conge: boolean }>();

  for (const it of arr) {
    if (!it?.start_date || !it?.end_date) continue;

    const date = String(it.start_date).slice(0, 10); // YYYY-MM-DD
    const endMin = toMinutes(String(it.end_date));
    const type = (it.typeCours || '').toUpperCase();

    if (!byDate.has(date)) byDate.set(date, { ends: [], conge: false });

    // Jour de congé ?
    if (type === 'CONGE') {
      const cur = byDate.get(date)!;
      cur.conge = true;
      byDate.set(date, cur);
      continue; // ne pas ajouter de fin
    }

    // Exclure PERMANENCE des fins de journée
    if (type === 'PERMANENCE') continue;

    if (endMin != null) {
      const cur = byDate.get(date)!;
      cur.ends.push(endMin);
      byDate.set(date, cur);
    }
  }

  // Construire le résultat normalisé
  const out: Record<string, { end: string | null; conge: boolean }> = {};
  for (const [date, { ends, conge }] of byDate.entries()) {
    if (conge) {
      out[date] = { end: null, conge: true };
    } else if (ends.length) {
      const last = Math.max(...ends);
      const h = Math.floor(last / 60);
      const m = last % 60;
      out[date] = {
        end: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        conge: false,
      };
    } else {
      // aucun cours utile ce jour (ni conge) -> end=null
      out[date] = { end: null, conge: false };
    }
  }

  console.log('[CalculDispo] map-by-date keys found =', Object.keys(out).length);
  return out;
}

// Calcule le score base selon règles en vigueur
function scoreBaseFor(endTimeStr: string | null, conge: boolean): number {
  if (conge) return 3;
  if (!endTimeStr) return 1; // par défaut s’il n’y a pas d’heure détectée
  const mins = toMinutes(`1970-01-01 ${endTimeStr}`) ?? 0; // réutilise le parseur
  if (mins < 15 * 60) return 2;
  if (mins > 15 * 60 && mins < 16 * 60) return 1.5; // strictement entre 15:00 et 16:00
  return 1;
}

export default function CalculDispo() {
  const [{ token, eleveId }, setAuth] = useState(getTokenAndEleveId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [raw, setRaw] = useState<any | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaPersoItem[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [errAgenda, setErrAgenda] = useState<string | null>(null);

  // fenêtre 4 semaines à partir d’aujourd’hui
  const [win, setWin] = useState<{ start: string; end: string }>(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 28);
    return { start: ymd(start), end: ymd(end) };
  });

  useEffect(() => {
    console.log('[CalculDispo] window', win);
  }, [win]);

  // Récup token/élève si storage change
  useEffect(() => {
    const onStorage = () => setAuth(getTokenAndEleveId());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Charger EDT
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!token || !eleveId) return;
      setLoading(true);
      setErr(null);
      try {
        const body = {
          token,
          eleveId,
          dateDebut: win.start,
          dateFin: win.end,
          avecTrous: true,
        };
        console.log('[CalculDispo] fetch /api/ed/edt body =', body);
        const res = await fetch('/api/ed/edt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json: EdtResponse = await res.json();
        console.log('[CalculDispo] /api/ed/edt status=', res.status, 'ok=', json?.ok);
        if (!res.ok || !json?.ok) throw new Error(`Échec EDT (status ${res.status})`);
        if (!aborted) setRaw(json.data);
      } catch (e: any) {
        if (!aborted) setErr(e?.message || 'Erreur chargement EDT');
      } finally {
        if (!aborted) setLoading(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [token, eleveId, win]);

  // Charger agenda_perso
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!eleveId) return;
      setLoadingAgenda(true);
      setErrAgenda(null);
      try {
        const res = await fetch('/api/agenda_perso/list', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eleveId }),
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) setAgendaItems(json.items || []);
      } catch (e: any) {
        if (!aborted) setErrAgenda(e?.message || 'Erreur chargement agenda perso');
      } finally {
        if (!aborted) setLoadingAgenda(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [eleveId]);

  // Set de jours de semaine (1..7) qui ont au moins un event perso
  const daysWithPersonalEvent: Set<number> = useMemo(() => {
    const set = new Set<number>();
    for (const it of agendaItems || []) {
      for (const d of it.days || []) {
        const n = Number(d);
        if (Number.isFinite(n) && n >= 1 && n <= 7) set.add(n);
      }
    }
    return set;
  }, [agendaItems]);

  // Extraction + calcul des scores
  const rows: Row[] = useMemo(() => {
    if (!raw) return [];
    const byDate = extractDailyInfo(raw); // { date: { end, conge } }

    const dates = Object.keys(byDate).sort();
    const out: Row[] = [];

    for (const date of dates) {
      const { end, conge } = byDate[date];
      const base = scoreBaseFor(end, conge);

      const wd = weekday1to7(date);
      const perso = daysWithPersonalEvent.has(wd) ? -1 : 0;

      out.push({
        date,
        endTimeStr: end,
        scoreBase: base,
        scorePerso: perso,
        scoreTotal: base + perso,
        conge,
      });
    }

    console.log('[CalculDispo] rows (with agenda perso) =', out);
    return out;
  }, [raw, daysWithPersonalEvent]);

  return (
    <section className="rounded-2xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Calcul dispo (4 semaines)</h2>
      </div>

      {(!token || !eleveId) && (
        <div className="rounded-lg border p-4 text-sm">
          Impossible de calculer : token ou élève non défini.
        </div>
      )}

      {loading && <div className="rounded-lg border p-4 text-sm">Chargement EDT…</div>}
      {err && <div className="rounded-lg border p-4 text-sm text-red-600">Erreur EDT : {err}</div>}

      {loadingAgenda && (
        <div className="rounded-lg border p-4 text-sm">Chargement agenda perso…</div>
      )}
      {errAgenda && (
        <div className="rounded-lg border p-4 text-sm text-red-600">
          Erreur agenda perso : {errAgenda}
        </div>
      )}

      {!loading && !err && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Heure de sortie</th>
                <th className="py-2 pr-3">Score base</th>
                <th className="py-2 pr-3">Score perso</th>
                <th className="py-2 pr-3">Score total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.date}</td>
                  <td className="py-2 pr-3">
                    {r.conge ? (
                      <span className="italic opacity-70">CONGÉS</span>
                    ) : (
                      r.endTimeStr ?? '—'
                    )}
                  </td>
                  <td className="py-2 pr-3">{r.scoreBase}</td>
                  <td className="py-2 pr-3">{r.scorePerso}</td>
                  <td className="py-2 pr-3 font-semibold">{r.scoreTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-lg border p-4 text-sm">Aucune donnée sur la période.</div>
      )}
    </section>
  );
}
