// components/CalculDispo.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

type EdtResponse = {
  ok: boolean;
  status?: number;
  data?: any;
  message?: string;
};

type Row = {
  date: string; // "YYYY-MM-DD"
  sortie: string; // "HH:MM" ou "—"
  // Scoring:
  // 3 (CONGE), 2 (<15:00), 1.5 (15:00–16:00 exclu), 1 (16:00–18:00), 0 (>=18:00 ou aucune sortie)
  score: number;
};

type DailyInfo = Record<string, { sortie: string | null; conge: boolean }>;

function fmtDateParisISO(date: Date) {
  const f = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = f.formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function addDaysParis(base: Date, days: number) {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function hhmmFromDateStr(dtStr: string): string | null {
  if (!dtStr || typeof dtStr !== 'string') return null;
  const m1 = dtStr.match(/T(\d{2}:\d{2})/);
  if (m1) return m1[1];
  const m2 = dtStr.match(/\b(\d{2}:\d{2})\b/);
  if (m2) return m2[1];
  return null;
}

function toMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mn)) return null;
  return h * 60 + mn;
}

/** Essaie d'extraire le tableau d'événements depuis différents formats observés */
function resolveEventsArray(raw: any): any[] {
  const logPick = (where: string, arr: any[]) =>
    console.log(`[CalculDispo] events array picked from ${where}: length=${arr.length}`);

  // 1) raw.data est un tableau ?
  if (Array.isArray(raw?.data)) {
    logPick('raw.data', raw.data);
    return raw.data;
  }
  // 2) raw.data.data est un tableau ?
  if (Array.isArray(raw?.data?.data)) {
    logPick('raw.data.data', raw.data.data);
    return raw.data.data;
  }
  // 3) raw.result ?
  if (Array.isArray(raw?.result)) {
    logPick('raw.result', raw.result);
    return raw.result;
  }
  // 4) raw.items ?
  if (Array.isArray(raw?.items)) {
    logPick('raw.items', raw.items);
    return raw.items;
  }
  // 5) raw.events ?
  if (Array.isArray(raw?.events)) {
    logPick('raw.events', raw.events);
    return raw.events;
  }
  // 6) raw lui-même est un tableau ?
  if (Array.isArray(raw)) {
    logPick('raw (self)', raw);
    return raw;
  }
  console.log('[CalculDispo] no events array found in known locations');
  return [];
}

/**
 * Extraction des infos quotidiennes depuis json.data (enveloppe variable).
 * Règles :
 *  - on ignore les créneaux "PERMANENCE" pour déterminer l'heure de sortie.
 *  - si la journée est un CONGE (aucun autre type), alors:
 *      -> sortie = null, conge = true (score = 3 plus tard).
 */
function extractDailyInfo(raw: any): DailyInfo {
  console.log(
    '[CalculDispo] extractDailyInfo: raw keys =',
    raw && typeof raw === 'object' ? Object.keys(raw) : raw,
  );

  const events = resolveEventsArray(raw);
  type Ev = { type: string; endMins: number; endHHMM: string; day: string };
  const evs: Ev[] = [];

  for (const ev of events) {
    const end = ev?.end_date as string | undefined;
    const start = ev?.start_date as string | undefined;
    const day = (end ?? start)?.slice?.(0, 10);
    const type = String(ev?.typeCours || '').toUpperCase();
    const hhmm = end ? hhmmFromDateStr(end) : null;
    const mins = hhmm ? toMinutes(hhmm) : null;
    if (!day || !hhmm || mins == null) continue;
    evs.push({ type, endMins: mins, endHHMM: hhmm, day });
  }

  console.log('[CalculDispo] parsed events count =', evs.length);

  const out: DailyInfo = {};
  const byDay = new Map<string, Ev[]>();
  for (const e of evs) {
    if (!byDay.has(e.day)) byDay.set(e.day, []);
    byDay.get(e.day)!.push(e);
  }

  for (const [day, list] of byDay.entries()) {
    // Journée 100% CONGE ?
    const hasNonConge = list.some((e) => e.type !== 'CONGE');
    const hasConge = list.some((e) => e.type === 'CONGE');

    if (!hasNonConge && hasConge) {
      out[day] = { sortie: null, conge: true };
      console.log(`[CalculDispo] ${day} => CONGE (sortie=null)`);
      continue;
    }

    // Dernier créneau NON PERMANENCE et NON CONGE
    const lastNonPerm = list
      .filter((e) => e.type !== 'PERMANENCE' && e.type !== 'CONGE')
      .sort((a, b) => a.endMins - b.endMins)
      .at(-1);

    if (lastNonPerm) {
      out[day] = { sortie: lastNonPerm.endHHMM, conge: false };
      console.log(`[CalculDispo] ${day} => ${lastNonPerm.endHHMM} (dernier non-PERMANENCE/CONGE)`);
    } else {
      // Seulement PERMANENCE (ou vide) -> sortie null, conge=false
      out[day] = { sortie: null, conge: false };
      console.log(`[CalculDispo] ${day} => uniquement PERMANENCE/aucun (sortie=null)`);
    }
  }

  console.log('[CalculDispo] dailyInfo =', out);
  return out;
}

export default function CalculDispo(
  props: { token?: string | null; eleveId?: number | null } = {},
) {
  const [token, setToken] = useState<string | null>(props.token ?? null);
  const [eleveId, setEleveId] = useState<number | null>(props.eleveId ?? null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [dailyInfo, setDailyInfo] = useState<DailyInfo>({});
  const [rawSample, setRawSample] = useState<any>(null);

  // fallback: sessionStorage si pas de props
  useEffect(() => {
    if (props.token != null || props.eleveId != null) return;
    try {
      const t = sessionStorage.getItem('ed_token');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      console.log('[CalculDispo] session token =', !!t, 'selected_eleve_id =', sid);
      setToken(t);
      setEleveId(sid ? Number(sid) : null);
    } catch {}
  }, [props.token, props.eleveId]);

  // fenêtre [aujourd'hui, +28 jours] Europe/Paris
  const { dateDebut, dateFin } = useMemo(() => {
    const today = new Date();
    const start = fmtDateParisISO(today);
    const end = fmtDateParisISO(addDaysParis(today, 28));
    console.log('[CalculDispo] window', { start, end });
    return { dateDebut: start, dateFin: end };
  }, []);

  useEffect(() => {
    let aborted = false;

    async function run() {
      if (!token || !eleveId) {
        console.log('[CalculDispo] manque token ou eleveId', { token, eleveId });
        return;
      }
      setLoading(true);
      setError(null);
      setRows([]);
      setDailyInfo({});
      setRawSample(null);

      try {
        const body = { token, eleveId, dateDebut, dateFin, avecTrous: true };
        console.log('[CalculDispo] fetch /api/ed/edt body =', body);
        const res = await fetch('/api/ed/edt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json: EdtResponse = await res.json();
        console.log('[CalculDispo] /api/ed/edt status=', res.status, 'ok=', json?.ok);
        if (!json?.ok) {
          console.log('[CalculDispo] edt error payload =', json);
          throw new Error(json?.message || `Échec de la récupération (status ${json?.status})`);
        }

        // json.data est l’enveloppe renvoyée par la route
        setRawSample(json.data);

        // 👉 on passe json.data à l’extracteur (qui résout l’array d’événements)
        const info = extractDailyInfo(json.data);
        if (aborted) return;

        setDailyInfo(info);

        // Construire le tableau + scoring (règles demandées)
        const dates = Object.keys(info).sort();
        const computed: Row[] = dates.map((d) => {
          const isConge = !!info[d]?.conge;
          const sortie = info[d]?.sortie ?? '—';

          let score: number;
          if (isConge) {
            score = 3;
          } else if (!info[d]?.sortie) {
            score = 0;
          } else {
            const mins = toMinutes(info[d]!.sortie!) ?? 24 * 60;
            const s1500 = 15 * 60;
            const s1600 = 16 * 60;
            const s1800 = 18 * 60;

            if (mins < s1500) score = 2;
            else if (mins > s1500 && mins < s1600) score = 1.5;
            else if (mins >= s1600 && mins < s1800) score = 1;
            else score = 0;
          }

          return { date: d, sortie, score };
        });

        console.log('[CalculDispo] rows (with latest scoring) =', computed);
        if (!aborted) setRows(computed);
      } catch (e: any) {
        console.error('[CalculDispo] run() error:', e);
        if (!aborted) setError(e?.message || "Erreur pendant le chargement de l'emploi du temps.");
      } finally {
        if (!aborted) setLoading(false);
      }
    }

    run();
    return () => {
      aborted = true;
    };
  }, [token, eleveId, dateDebut, dateFin]);

  return (
    <section className="rounded-2xl border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Disponibilités (prochaines 4 semaines)</h3>
      </div>

      {!token || !eleveId ? (
        <div className="rounded-lg border p-4 text-sm">Token ou identifiant élève manquant.</div>
      ) : loading ? (
        <div className="rounded-lg border p-4 text-sm">Chargement de l'emploi du temps…</div>
      ) : error ? (
        <div className="rounded-lg border p-4 text-sm text-red-600">Erreur : {error}</div>
      ) : (
        <>
          {/* ✅ Tableau principal (date, heure de sortie, score) */}
          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Heure de sortie</th>
                    <th className="py-2 pr-4">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.date} className="border-b last:border-b-0">
                      <td className="py-2 pr-4">
                        {new Intl.DateTimeFormat('fr-FR', {
                          timeZone: 'Europe/Paris',
                          weekday: 'long',
                          day: '2-digit',
                          month: 'long',
                        }).format(new Date(r.date))}
                        <span className="opacity-60"> ({r.date})</span>
                        {dailyInfo[r.date]?.conge ? (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full border">
                            CONGÉ
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4">{r.sortie}</td>
                      <td className="py-2 pr-4">
                        <span className="px-2 py-0.5 rounded-full border">{r.score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg border p-4 text-sm">Aucune donnée sur la période.</div>
          )}

          {/* 🔎 Bloc DEBUG */}
          <details className="rounded-lg border p-4 text-xs open:space-y-2">
            <summary className="cursor-pointer">DEBUG · heures de sortie / structure EDT</summary>

            <div>
              <div className="font-medium mb-1">Heures de sortie par jour :</div>
              {Object.keys(dailyInfo).length > 0 ? (
                <ul className="list-disc ml-5">
                  {Object.keys(dailyInfo)
                    .sort()
                    .map((d) => (
                      <li key={d}>
                        <code>{d}</code> → <strong>{dailyInfo[d].sortie ?? '—'}</strong>
                        {dailyInfo[d].conge ? '  (CONGE)' : ''}
                      </li>
                    ))}
                </ul>
              ) : (
                <div>Aucune heure détectée (vérifie les logs console).</div>
              )}
            </div>

            <div className="mt-3">
              <div className="font-medium mb-1">Clés top-level de json.data :</div>
              <pre className="whitespace-pre-wrap">
                {rawSample && typeof rawSample === 'object'
                  ? JSON.stringify(Object.keys(rawSample), null, 2)
                  : String(rawSample)}
              </pre>
            </div>

            <div className="mt-3">
              <div className="font-medium mb-1">Aperçu (json.data) :</div>
              <pre className="whitespace-pre-wrap overflow-x-auto max-h-64">
                {JSON.stringify(rawSample, null, 2)}
              </pre>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
