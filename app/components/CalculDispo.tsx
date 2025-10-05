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

function toMinutes(str: string): number | null {
  if (!str) return null;
  const parts = str.split(' ');
  const hm = parts.length === 2 ? parts[1] : parts[0];
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function weekday1to7(dateYMD: string): number {
  const dt = new Date(`${dateYMD}T12:00:00`);
  const js = dt.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1..7
}

function nextThursdayFrom(today: Date): Date {
  const wd0 = today.getDay(); // 0=dim…6=sam
  const wd = wd0 === 0 ? 7 : wd0; // 1..7
  const THURSDAY = 4; // 1=lun … 4=jeu … 7=dim
  const delta = (THURSDAY - wd + 7) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() + delta);
  return d;
}

function extractDailyInfo(raw: any): Record<string, { end: string | null; conge: boolean }> {
  console.log('[CalculDispo] extractDailyInfo: raw keys =', Object.keys(raw || {}));

  let arr: EdtItem[] = [];
  if (Array.isArray(raw)) arr = raw as EdtItem[];
  if (!arr.length && Array.isArray(raw?.data)) arr = raw.data as EdtItem[];

  if (!arr.length) {
    console.log('[CalculDispo] format inattendu (pas de .data array) -> aucun calcul');
    return {};
  }

  const byDate = new Map<string, { ends: number[]; conge: boolean }>();

  for (const it of arr) {
    if (!it?.start_date || !it?.end_date) continue;

    const date = String(it.start_date).slice(0, 10);
    const endMin = toMinutes(String(it.end_date));
    const type = (it.typeCours || '').toUpperCase();

    if (!byDate.has(date)) byDate.set(date, { ends: [], conge: false });

    if (type === 'CONGE') {
      const cur = byDate.get(date)!;
      cur.conge = true;
      byDate.set(date, cur);
      continue;
    }

    if (type === 'PERMANENCE') continue;

    if (endMin != null) {
      const cur = byDate.get(date)!;
      cur.ends.push(endMin);
      byDate.set(date, cur);
    }
  }

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
      out[date] = { end: null, conge: false };
    }
  }

  console.log('[CalculDispo] map-by-date keys found =', Object.keys(out).length);
  return out;
}

// Règles score base : CONGÉS=3 ; <15:00 => 2 ; (15:00,16:00) => 1.5 ; sinon 1
function scoreBaseFor(endTimeStr: string | null, conge: boolean): number {
  if (conge) return 3;
  if (!endTimeStr) return 1;
  const mins = toMinutes(`1970-01-01 ${endTimeStr}`) ?? 0;
  if (mins < 15 * 60) return 2;
  if (mins > 15 * 60 && mins < 16 * 60) return 1.5;
  return 1;
}

type Props = {
  onAggregateScore?: (score: number, from: string, to: string) => void;
};

export default function CalculDispo({ onAggregateScore }: Props) {
  const [{ token, eleveId }, setAuth] = useState(getTokenAndEleveId);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [raw, setRaw] = useState<any | null>(null);
  const [agendaItems, setAgendaItems] = useState<AgendaPersoItem[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState(false);
  const [errAgenda, setErrAgenda] = useState<string | null>(null);

  const [win] = useState<{ start: string; end: string }>(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 28);
    return { start: ymd(start), end: ymd(end) };
  });

  useEffect(() => {
    const onStorage = () => setAuth(getTokenAndEleveId());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // EDT
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!token || !eleveId) return;
      setLoading(true);
      setErr(null);
      try {
        const body = { token, eleveId, dateDebut: win.start, dateFin: win.end, avecTrous: true };
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
  }, [token, eleveId, win.start, win.end]);

  // agenda_perso
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
        if (!aborted) setErrAgenda(e?.message || 'Erreur agenda perso');
      } finally {
        if (!aborted) setLoadingAgenda(false);
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [eleveId]);

  // jours avec événement perso
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

  // lignes + scores
  const rows: Row[] = useMemo(() => {
    if (!raw) return [];
    const byDate = extractDailyInfo(raw);
    const dates = Object.keys(byDate).sort();
    const out: Row[] = [];
    for (const date of dates) {
      const { end, conge } = byDate[date];
      const base = scoreBaseFor(end, conge);
      const wd = weekday1to7(date);
      const perso = daysWithPersonalEvent.has(wd) ? -1 : 0;
      out.push({
        date,
        endTimeStr: conge ? null : end,
        scoreBase: base,
        scorePerso: perso,
        scoreTotal: base + perso,
        conge,
      });
    }
    return out;
  }, [raw, daysWithPersonalEvent]);

  // agrégat aujourd’hui → jeudi prochain
  const { aggFrom, aggTo, aggregateScore } = useMemo(() => {
    const today = new Date();
    const from = ymd(today);
    const to = ymd(nextThursdayFrom(today));
    const score = rows
      .filter((r) => r.date >= from && r.date <= to)
      .reduce((acc, r) => acc + r.scoreTotal, 0);
    return { aggFrom: from, aggTo: to, aggregateScore: score };
  }, [rows]);

  // score du jour (ou week-end) — avec imputation du samedi si on est dimanche et que samedi manque dans les rows
  const { dayLabel, dayScore, weekendFrom, weekendTo } = useMemo(() => {
    const today = new Date();
    const todayStr = ymd(today);
    const wd = weekday1to7(todayStr); // 1..7

    if (wd === 6 || wd === 7) {
      // Détermination samedi/dimanche du week-end courant
      let saturday = new Date(today);
      let sunday = new Date(today);
      if (wd === 6) {
        // Samedi -> dimanche = +1
        sunday.setDate(today.getDate() + 1);
      } else {
        // Dimanche -> samedi = -1
        saturday.setDate(today.getDate() - 1);
      }
      const satStr = ymd(saturday);
      const sunStr = ymd(sunday);

      // Score samedi (réel si présent, sinon imputation 3 - (événement perso ? 1 : 0))
      let satScore = rows.find((r) => r.date === satStr)?.scoreTotal;
      if (wd === 7 && satScore == null) {
        const hasPersonalEventSaturday = daysWithPersonalEvent.has(6); // 6 = samedi
        satScore = 3 + (hasPersonalEventSaturday ? -1 : 0);
        console.log(
          '[CalculDispo] Imputation score samedi:',
          satScore,
          '(3',
          hasPersonalEventSaturday ? '-1' : '+0',
          ')',
        );
      }

      const sunScore = rows.find((r) => r.date === sunStr)?.scoreTotal ?? 0;

      return {
        dayLabel: 'Score week-end',
        dayScore: (satScore ?? 0) + sunScore,
        weekendFrom: satStr,
        weekendTo: sunStr,
      };
    }

    // Jour ouvré (lun→ven)
    const score = rows.find((r) => r.date === todayStr)?.scoreTotal ?? 0;
    return {
      dayLabel: 'Score du jour',
      dayScore: score,
      weekendFrom: null as string | null,
      weekendTo: null as string | null,
    };
  }, [rows, daysWithPersonalEvent]);

  // expose au parent + sessionStorage
  useEffect(() => {
    if (typeof aggregateScore === 'number') {
      onAggregateScore?.(aggregateScore, aggFrom, aggTo);
      try {
        sessionStorage.setItem('calcdispo_week_score', String(aggregateScore));
        sessionStorage.setItem('calcdispo_week_from', aggFrom);
        sessionStorage.setItem('calcdispo_week_to', aggTo);
      } catch {}
    }
  }, [aggregateScore, aggFrom, aggTo, onAggregateScore]);

  useEffect(() => {
    try {
      sessionStorage.setItem('calcdispo_day_label', dayLabel);
      sessionStorage.setItem('calcdispo_day_score', String(dayScore));
      if (weekendFrom) sessionStorage.setItem('calcdispo_weekend_from', weekendFrom);
      if (weekendTo) sessionStorage.setItem('calcdispo_weekend_to', weekendTo);
    } catch {}
  }, [dayLabel, dayScore, weekendFrom, weekendTo]);

  return (
    <section className="rounded-2xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Calcul dispo (4 semaines)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border p-4 bg-gray-50">
          <div className="text-sm opacity-70">Score total (aujourd’hui → jeudi prochain)</div>
          <div className="text-2xl font-semibold">
            {aggregateScore.toFixed(2)}{' '}
            <span className="text-base font-normal opacity-70">
              ({aggFrom} → {aggTo})
            </span>
          </div>
        </div>

        <div className="rounded-xl border p-4 bg-gray-50">
          <div className="text-sm opacity-70">{dayLabel}</div>
          <div className="text-2xl font-semibold">
            {dayScore.toFixed(2)}{' '}
            {dayLabel === 'Score week-end' && weekendFrom && weekendTo && (
              <span className="text-base font-normal opacity-70">
                ({weekendFrom} + {weekendTo})
              </span>
            )}
          </div>
        </div>
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
