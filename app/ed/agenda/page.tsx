// app/ed/agenda/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type EdtResponse = {
  ok: boolean;
  status: number;
  data: any;
};

type EdtItem = {
  id: number;
  text?: string;
  matiere?: string;
  codeMatiere?: string;
  typeCours?: string; // COURS / PERMANENCE / ...
  start_date: string; // "YYYY-MM-DD HH:mm"
  end_date: string; // "YYYY-MM-DD HH:mm"
  color?: string; // "#RRGGBB"
  prof?: string;
  salle?: string;
  isAnnule?: boolean;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Dimanche ... 1=Lundi
  const diff = day === 0 ? -6 : 1 - day; // amener à lundi
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sundayOf(date: Date) {
  const monday = mondayOf(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

function getWeekRange(d: Date) {
  const start = mondayOf(d);
  const end = sundayOf(d);
  return { start, end };
}

function shiftWeek(range: { start: Date; end: Date }, deltaWeeks: number) {
  const s = new Date(range.start);
  const e = new Date(range.end);
  s.setDate(s.getDate() + deltaWeeks * 7);
  e.setDate(e.getDate() + deltaWeeks * 7);
  return { start: s, end: e };
}

function listDays(startYMD: string, endYMD: string) {
  const days: Date[] = [];
  let d = parseYMD(startYMD);
  const end = parseYMD(endYMD);
  d.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function labelDay(d: Date) {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

function parseEdDate(s: string): Date {
  // "YYYY-MM-DD HH:mm" → "YYYY-MM-DDTHH:mm:00"
  const t = s.replace(' ', 'T');
  return new Date(t.length === 16 ? t + ':00' : t);
}

function minutesSinceMidnight(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function contrastText(bg?: string) {
  if (!bg || !/^#?[0-9a-f]{6}$/i.test(bg)) return '#111827'; // gray-900 fallback
  const hex = bg.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#111827' : '#ffffff'; // noir si fond clair, blanc sinon
}

/** Cherche en priorité data.accounts[0].profile.eleves[0].id, sinon variantes. */
function findFirstEleveStrict(obj: any): { id: number; prenom?: string; nom?: string } | null {
  if (!obj) return null;

  const p1 = obj?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p1 && typeof p1.id === 'number') return { id: p1.id, prenom: p1.prenom, nom: p1.nom };

  const p2 = obj?.accounts?.[0]?.profile?.eleves?.[0];
  if (p2 && typeof p2.id === 'number') return { id: p2.id, prenom: p2.prenom, nom: p2.nom };

  const p3 = obj?.data?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p3 && typeof p3.id === 'number') return { id: p3.id, prenom: p3.prenom, nom: p3.nom };

  const p4 = obj?.data?.eleves?.[0];
  if (p4 && typeof p4.id === 'number') return { id: p4.id, prenom: p4.prenom, nom: p4.nom };
  const p5 = obj?.eleves?.[0];
  if (p5 && typeof p5.id === 'number') return { id: p5.id, prenom: p5.prenom, nom: p5.nom };

  // fallback prudent
  const seen = new Set<any>();
  const q: Array<{ node: any; parentKey?: string }> = [{ node: obj }];

  while (q.length) {
    const { node } = q.shift()!;
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const it of node) q.push({ node: it });
      continue;
    }

    if (Array.isArray((node as any).eleves) && (node as any).eleves[0]?.id) {
      const e = (node as any).eleves[0];
      if (typeof e.id === 'number') return { id: e.id, prenom: e.prenom, nom: e.nom };
    }

    if ((node as any).eleve?.id && typeof (node as any).eleve.id === 'number') {
      const e = (node as any).eleve;
      return { id: e.id, prenom: e.prenom, nom: e.nom };
    }

    for (const v of Object.values(node)) {
      if (v && (typeof v === 'object' || Array.isArray(v))) q.push({ node: v });
    }
  }

  return null;
}

export default function AgendaPage() {
  // semaine en cours par défaut
  const initial = useMemo(() => getWeekRange(new Date()), []);
  const [dateDebut, setDateDebut] = useState<string>(ymd(initial.start));
  const [dateFin, setDateFin] = useState<string>(ymd(initial.end));
  const [avecTrous, setAvecTrous] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<any>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [eleveNomComplet, setEleveNomComplet] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);

  // Récupère token + données login depuis la session et détecte l'élève
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      setToken(t);
      const parsed = d ? JSON.parse(d) : null;
      setLoginData(parsed);

      const e = findFirstEleveStrict(parsed?.data ?? parsed);
      if (e?.id) {
        setEleveId(e.id);
        setEleveNomComplet([e.prenom, e.nom].filter(Boolean).join(' ') || null);
      }

      console.log('[Agenda] Session snapshot', {
        hasToken: !!t,
        foundEleve: e,
        primaryPathId: parsed?.data?.accounts?.[0]?.profile?.eleves?.[0]?.id,
      });
    } catch (e) {
      console.warn('[Agenda] parse session failed', e);
    }
  }, []);

  // ---- Navigation plage ----
  function setToday() {
    const today = new Date();
    const s = ymd(today);
    setDateDebut(s);
    setDateFin(s);
  }
  function setCurrentWeek() {
    const r = getWeekRange(new Date());
    setDateDebut(ymd(r.start));
    setDateFin(ymd(r.end));
  }
  function shiftDisplayedWeek(delta: number) {
    const r = { start: parseYMD(dateDebut), end: parseYMD(dateFin) };
    const next = shiftWeek(r, delta);
    setDateDebut(ymd(next.start));
    setDateFin(ymd(next.end));
  }

  // ---- Chargement EDT ----
  async function loadEdt(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setRaw(null);
    setLoading(true);

    try {
      if (!token) throw new Error('Token manquant — reconnecte-toi.');
      if (!eleveId) throw new Error('Identifiant élève introuvable dans les données de session.');

      console.log('[Agenda] Request /api/ed/edt', {
        eleveId,
        dateDebut,
        dateFin,
        avecTrous,
      });

      const res = await fetch('/api/ed/edt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          eleveId,
          dateDebut,
          dateFin,
          avecTrous,
          // cookieHeader: sessionStorage.getItem("ed_cookie") || undefined,
        }),
      });

      const json: EdtResponse = await res.json();
      if (!json.ok) {
        throw new Error(`Échec de la récupération (status ${json.status})`);
      }
      setRaw(json.data);
    } catch (err: any) {
      setError(err?.message || "Erreur pendant le chargement de l'emploi du temps.");
    } finally {
      setLoading(false);
    }
  }

  // auto-chargement au montage (semaine en cours)
  useEffect(() => {
    if (token && eleveId) {
      loadEdt().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eleveId, dateDebut, dateFin]);

  // ---- Préparation des événements pour l'affichage ----
  const events: EdtItem[] = useMemo(() => {
    const payload = raw?.data ?? raw;
    if (!payload) return [];
    // selon la doc, c'est un tableau d'objets cours dans data
    // sinon certains tenants renvoient directement le tableau en racine
    const arr = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    return (arr as any[]).filter(Boolean) as EdtItem[];
  }, [raw]);

  const days = useMemo(() => listDays(dateDebut, dateFin), [dateDebut, dateFin]);

  // Déterminer la fenêtre horaire à afficher (par défaut 08:00 → 18:00 si vide)
  const { minHour, maxHour } = useMemo(() => {
    if (!events.length) return { minHour: 8, maxHour: 18 };
    let minM = Infinity;
    let maxM = -Infinity;
    for (const ev of events) {
      const s = parseEdDate(ev.start_date);
      const e = parseEdDate(ev.end_date);
      minM = Math.min(minM, minutesSinceMidnight(s));
      maxM = Math.max(maxM, minutesSinceMidnight(e));
    }
    if (!isFinite(minM) || !isFinite(maxM)) return { minHour: 8, maxHour: 18 };
    // marge d'1h autour
    const minH = Math.max(6, Math.floor(minM / 60) - 1);
    const maxH = Math.min(22, Math.ceil(maxM / 60) + 1);
    return { minHour: minH, maxHour: Math.max(minH + 1, maxH) };
  }, [events]);

  const totalMinutes = (maxHour - minHour) * 60;
  const columnHeightPx = Math.max(400, totalMinutes); // 1px / minute, min 400px

  function eventsForDay(day: Date) {
    const ymdDay = ymd(day);
    return events.filter((ev) => ev.start_date.startsWith(ymdDay));
  }

  function topPx(d: Date) {
    const mins = minutesSinceMidnight(d);
    const rel = clamp(mins - minHour * 60, 0, totalMinutes);
    return (rel / totalMinutes) * columnHeightPx;
  }
  function heightPx(s: Date, e: Date) {
    const start = clamp(minutesSinceMidnight(s), minHour * 60, maxHour * 60);
    const end = clamp(minutesSinceMidnight(e), minHour * 60, maxHour * 60);
    const span = Math.max(15, end - start); // min 15 minutes visuelles
    return (span / totalMinutes) * columnHeightPx;
  }

  // lignes horaires
  const hourMarks = useMemo(() => {
    const arr: number[] = [];
    for (let h = minHour; h <= maxHour; h++) arr.push(h);
    return arr;
  }, [minHour, maxHour]);

  const headerEleve = useMemo(() => {
    if (eleveId && eleveNomComplet) return `Élève ${eleveNomComplet} (#${eleveId})`;
    if (eleveId) return `Élève #${eleveId}`;
    return 'Élève introuvable dans la session';
  }, [eleveId, eleveNomComplet]);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Emploi du temps</h1>
            <p className="text-sm text-gray-500">{headerEleve}</p>
          </div>

          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
            ← Retour
          </Link>
        </header>

        {/* Contrôles de plage */}
        <form onSubmit={loadEdt} className="rounded-2xl border p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium">Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium">Date fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="avecTrous"
                type="checkbox"
                checked={avecTrous}
                onChange={(e) => setAvecTrous(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="avecTrous" className="text-sm">
                Avec trous
              </label>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => shiftDisplayedWeek(-1)}
                className="rounded-xl border px-3 py-2 hover:bg-gray-50"
              >
                ← Semaine
              </button>
              <button
                type="button"
                onClick={setCurrentWeek}
                className="rounded-xl border px-3 py-2 hover:bg-gray-50"
              >
                Semaine en cours
              </button>
              <button
                type="button"
                onClick={() => shiftDisplayedWeek(1)}
                className="rounded-xl border px-3 py-2 hover:bg-gray-50"
              >
                Semaine →
              </button>
              <button
                type="button"
                onClick={setToday}
                className="rounded-xl border px-3 py-2 hover:bg-gray-50"
              >
                Aujourd’hui
              </button>
              <button
                type="submit"
                disabled={loading || !eleveId}
                className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
                title={!eleveId ? 'Élève introuvable dans la session' : 'Charger'}
              >
                {loading ? 'Chargement…' : 'Charger'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Astuce : la semaine affichée va du <b>{dateDebut}</b> au <b>{dateFin}</b>. Le rendu
            s’appuie sur <code>start_date</code>/<code>end_date</code>, <code>matiere</code>,{' '}
            <code>prof</code>, <code>salle</code> renvoyés par l’API ED.
          </p>
        </form>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Rendu visuel */}
        <section className="rounded-2xl border p-4">
          <div
            className="grid gap-x-2"
            style={{ gridTemplateColumns: `80px repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {/* En-tête vide + jours */}
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="text-center text-sm font-medium py-2">
                {labelDay(d)}
              </div>
            ))}

            {/* Colonne heures */}
            <div className="relative" style={{ height: columnHeightPx }}>
              {hourMarks.map((h) => (
                <div
                  key={h}
                  className="absolute right-2 text-xs text-gray-500"
                  style={{ top: ((h - minHour) / (maxHour - minHour)) * columnHeightPx - 8 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Colonnes jours */}
            {days.map((d) => {
              const evs = eventsForDay(d);
              return (
                <div
                  key={d.toISOString() + '-col'}
                  className="relative border-l"
                  style={{ height: columnHeightPx }}
                >
                  {/* lignes horaires */}
                  {hourMarks.map((h) => (
                    <div
                      key={h}
                      className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                      style={{ top: ((h - minHour) / (maxHour - minHour)) * columnHeightPx }}
                    />
                  ))}

                  {/* blocs cours */}
                  {evs.map((ev) => {
                    const s = parseEdDate(ev.start_date);
                    const e = parseEdDate(ev.end_date);
                    const top = topPx(s);
                    const h = heightPx(s, e);
                    const bg = ev.color || '#93c5fd'; // fallback blue-300
                    const fg = contrastText(ev.color);
                    const title = ev.text || ev.matiere || 'Cours';
                    const subtitle = [ev.prof, ev.salle].filter(Boolean).join(' • ');
                    const annule = ev.isAnnule ? 'line-through opacity-60' : '';
                    return (
                      <div
                        key={ev.id}
                        className={`absolute left-1 right-1 rounded-md shadow-sm p-2 text-xs ${annule}`}
                        style={{ top, height: h, backgroundColor: bg, color: fg }}
                        title={`${title}\n${subtitle}\n${ev.start_date} → ${ev.end_date}`}
                      >
                        <div className="font-semibold truncate">{title}</div>
                        {subtitle && <div className="truncate opacity-90">{subtitle}</div>}
                        <div className="opacity-80">
                          {ev.start_date.slice(11)}–{ev.end_date.slice(11)}
                        </div>
                        {ev.typeCours && <div className="opacity-70">{ev.typeCours}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        {/* Réponse brute pour debug */}
        <section className="rounded-2xl border p-6 space-y-3">
          <h2 className="text-lg font-medium">Réponse brute</h2>
          <pre className="text-xs overflow-auto p-4 rounded-xl bg-gray-900 text-gray-100 font-mono leading-relaxed border border-gray-700">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
