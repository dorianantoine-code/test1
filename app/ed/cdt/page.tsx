// app/ed/cdt/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CdtResponse = { ok: boolean; status: number; data: any };
type CdtDayResponse = { ok: boolean; status: number; data: any };

function findFirstEleveStrict(obj: any): { id: number; prenom?: string; nom?: string } | null {
  if (!obj) return null;
  const p1 = obj?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p1?.id) return p1;
  const p2 = obj?.accounts?.[0]?.profile?.eleves?.[0];
  if (p2?.id) return p2;
  const p3 = obj?.data?.data?.accounts?.[0]?.profile?.eleves?.[0];
  if (p3?.id) return p3;
  const p4 = obj?.data?.eleves?.[0];
  if (p4?.id) return p4;
  const p5 = obj?.eleves?.[0];
  if (p5?.id) return p5;
  return null;
}

// --- Base64 → HTML (utf-8) ---
function b64decodeHtml(b64?: string): string | undefined {
  if (!b64 || typeof b64 !== 'string') return undefined;
  try {
    const s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    const padded = s + '='.repeat(pad);
    const decoded = decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return decoded;
  } catch {
    return undefined;
  }
}

// --- Sanitisation ultra light (dev) ---
function sanitizeHtmlBasic(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

// --- Types simplifiés d'affichage ---
type DevoirLight = {
  matiere: string;
  idDevoir: number;
  donneLe?: string;
  effectue?: boolean;
  interrogation?: boolean;
  rendreEnLigne?: boolean;
};

type DayDetail = {
  date: string;
  matieres: Array<{
    entityCode: string;
    entityLibelle: string;
    entityType: string;
    matiere: string;
    nomProf: string;
    id: number;
    interrogation: boolean;
    aFaire?: {
      idDevoir: number;
      contenu?: string; // HTML (base64)
      rendreEnLigne?: boolean;
      donneLe?: string;
      effectue?: boolean;
      documents?: Array<{
        id: number;
        libelle: string;
        date: string;
        taille: number;
        type: string;
      }>;
      commentaires?: Array<{
        id: number;
        auteur: string;
        date: string;
        message: string; // base64
      }>;
      contenuDeSeance?: {
        contenu?: string; // HTML (base64)
        documents?: Array<any>;
        commentaires?: Array<any>;
      };
    };
    contenuDeSeance?: {
      idDevoir: number;
      contenu?: string; // HTML (base64)
      documents?: Array<any>;
      commentaires?: Array<any>;
    };
  }>;
};

// --- Normalisation de clé date -> "YYYY-MM-DD"
const DATE_KEY_RE = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;
function normalizeDateKey(key: string): string | null {
  const m = DATE_KEY_RE.exec(key);
  return m ? m[1] : null;
}

export default function CdtPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<any>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [eleveNomComplet, setEleveNomComplet] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);

  // détail par jour
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayData, setDayData] = useState<Record<string, DayDetail | null>>({});

  // chargement session
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      const selectedId = sessionStorage.getItem('ed_selected_eleve_id');
      const selectedName = sessionStorage.getItem('ed_selected_eleve_name');
      setToken(t);
      const parsed = d ? JSON.parse(d) : null;
      setLoginData(parsed);

      if (selectedId) {
        setEleveId(Number(selectedId));
        setEleveNomComplet(selectedName || null);
      } else {
        const e = findFirstEleveStrict(parsed?.data ?? parsed);
        if (e?.id) {
          setEleveId(e.id);
          setEleveNomComplet([e.prenom, e.nom].filter(Boolean).join(' ') || null);
        }
      }

      console.log('[CDT] Session snapshot', { hasToken: !!t, selectedId });
    } catch (e) {
      console.warn('[CDT] parse session failed', e);
    }
  }, []);

  const headerEleve = useMemo(() => {
    if (eleveId && eleveNomComplet) return `Élève ${eleveNomComplet} (#${eleveId})`;
    if (eleveId) return `Élève #${eleveId}`;
    return 'Élève introuvable dans la session';
  }, [eleveId, eleveNomComplet]);

  async function loadCdt(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setRaw(null);
    setOpenDate(null);
    setDayData({});
    setLoading(true);

    try {
      if (!token) throw new Error('Token manquant — reconnecte-toi.');
      if (!eleveId) throw new Error('Identifiant élève introuvable dans la sélection.');

      console.log('[CDT] Request /api/ed/cdt', { eleveId });

      const res = await fetch('/api/ed/cdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, eleveId }),
      });

      const json: CdtResponse = await res.json();
      if (!json.ok) throw new Error(`Échec de la récupération (status ${json.status})`);

      setRaw(json.data);
    } catch (err: any) {
      setError(err?.message || 'Erreur pendant le chargement du cahier de texte.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token && eleveId) loadCdt().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, eleveId]);

  // --- Extraction robuste des dates + listes
  type DateBucket = { date: string; list: DevoirLight[] };
  const itemsByDate: DateBucket[] = useMemo(() => {
    const top = raw?.data ?? raw;
    // parfois la passerelle renvoie { code, data: { ...dates } }
    const map =
      top && typeof top === 'object' && !Array.isArray(top)
        ? top.data && typeof top.data === 'object' && !Array.isArray(top.data)
          ? top.data
          : top
        : {};

    const buckets = new Map<string, DevoirLight[]>();

    for (const k of Object.keys(map)) {
      const norm = normalizeDateKey(k);
      const arr = (Array.isArray(map[k]) ? map[k] : []) as any[];
      if (!norm || !arr.length) continue;

      const existing = buckets.get(norm) || [];
      // Projection minimale pour l’aperçu
      const projected: DevoirLight[] = arr.map((d: any) => ({
        matiere: d?.matiere ?? d?.libelle ?? 'Matière',
        idDevoir:
          typeof d?.idDevoir === 'number'
            ? d.idDevoir
            : typeof d?.id === 'number'
            ? d.id
            : Math.random(),
        donneLe: d?.donneLe,
        effectue: d?.effectue,
        interrogation: d?.interrogation,
        rendreEnLigne: d?.rendreEnLigne,
      }));
      buckets.set(norm, existing.concat(projected));
    }

    const result = Array.from(buckets.entries())
      .map(([date, list]) => ({ date, list }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // debug console
    try {
      console.log(
        '[CDT] Dates trouvées:',
        result.map((r) => ({ date: r.date, count: r.list.length })),
      );
    } catch {}

    return result;
  }, [raw]);

  // Détail d’un jour
  async function toggleDay(date: string) {
    setDayError(null);
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    setOpenDate(date);

    if (!dayData[date]) {
      try {
        setDayLoading(true);
        if (!token) throw new Error('Token manquant.');
        if (!eleveId) throw new Error('Élève manquant.');

        console.log('[CDT] Request /api/ed/cdt/day', { eleveId, date });

        const res = await fetch('/api/ed/cdt/day', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, eleveId, date }),
        });
        const json: CdtDayResponse = await res.json();
        if (!json.ok) throw new Error(`Échec (status ${json.status})`);

        const detail = (json.data?.data ?? json.data) as DayDetail;
        setDayData((prev) => ({ ...prev, [date]: detail }));
      } catch (err: any) {
        setDayError(err?.message || 'Erreur lors du chargement du détail.');
        setDayData((prev) => ({ ...prev, [date]: null }));
      } finally {
        setDayLoading(false);
      }
    }
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* HEADER blanc */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Cahier de texte</h1>
            <p className="text-sm text-white/80">{headerEleve}</p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl border px-4 py-2 text-white border-white/40 hover:bg-white/10"
          >
            ← Retour
          </Link>
        </header>

        {/* Barre d'action */}
        <form
          onSubmit={loadCdt}
          className="rounded-2xl border p-4 flex items-center gap-3 border-gray-300 bg-white/60 backdrop-blur"
        >
          <button
            type="submit"
            disabled={loading || !eleveId}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
            title={!eleveId ? 'Élève introuvable dans la sélection' : 'Recharger'}
          >
            {loading ? 'Chargement…' : 'Recharger'}
          </button>
          <span className="text-xs text-gray-700">
            Liste des devoirs à faire à partir d’aujourd’hui (groupés par date).
          </span>
        </form>

        {error && (
          <div className="rounded-2xl border border-red-500 bg-red-100 p-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {/* LISTE CONTRASTÉE */}
        <section className="rounded-2xl border p-4 space-y-4 border-gray-300 bg-white/60 backdrop-blur">
          <h2 className="text-lg font-semibold text-black">Cahier de texte</h2>

          {itemsByDate.length === 0 && !loading && (
            <div className="text-sm text-gray-800">
              Aucun devoir à venir.
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-700">
                  Debug : clés détectées
                </summary>
                <div className="text-xs mt-2">
                  {(() => {
                    const top = raw?.data ?? raw;
                    const map = top?.data && typeof top.data === 'object' ? top.data : top;
                    const keys = map && typeof map === 'object' ? Object.keys(map) : [];
                    return (
                      <ul className="list-disc pl-5">
                        {keys.map((k) => (
                          <li key={k}>
                            <code>{k}</code> → {normalizeDateKey(k) ? 'date valide' : 'ignorée'}
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </details>
            </div>
          )}

          <div className="space-y-4">
            {itemsByDate.map(({ date, list }) => (
              <div key={date} className="border rounded-xl border-gray-300 bg-white">
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex items-center justify-between text-black"
                  onClick={() => toggleDay(date)}
                >
                  <span className="font-semibold">
                    {new Date(date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                    })}
                  </span>
                  <span className="text-sm text-gray-800">
                    {list.length} élément{list.length > 1 ? 's' : ''}
                  </span>
                </button>

                {/* liste simple */}
                <div className="px-4 pb-3 space-y-2">
                  {list.map((d) => (
                    <div
                      key={`${date}-${d.idDevoir}`}
                      className="rounded-lg border p-3 flex flex-col gap-1 bg-white text-black border-gray-300"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{d.matiere}</span>
                        {d.interrogation ? (
                          <span className="text-xs rounded-full bg-yellow-300 text-black px-2 py-0.5">
                            Interrogation
                          </span>
                        ) : null}
                        {d.rendreEnLigne ? (
                          <span className="text-xs rounded-full bg-indigo-300 text-black px-2 py-0.5">
                            Rendu en ligne
                          </span>
                        ) : null}
                        <span
                          className={`text-xs rounded-full px-2 py-0.5 ${
                            d.effectue ? 'bg-emerald-300' : 'bg-rose-300'
                          } text-black`}
                        >
                          {d.effectue ? 'Effectué' : 'À faire'}
                        </span>
                      </div>
                      {d.donneLe && (
                        <div className="text-xs text-gray-800">
                          Donné le <b>{new Date(d.donneLe).toLocaleDateString('fr-FR')}</b>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* détail du jour */}
                {openDate === date && (
                  <div className="border-t px-4 py-4 space-y-4 border-gray-200">
                    {dayLoading && <div className="text-sm text-black">Chargement du détail…</div>}
                    {dayError && (
                      <div className="rounded-lg border border-red-500 bg-red-100 p-3 text-sm text-red-900">
                        {dayError}
                      </div>
                    )}

                    {dayData[date] && (
                      <div className="space-y-3">
                        {(dayData[date]!.matieres || []).map((m) => {
                          const aFaireHtml = sanitizeHtmlBasic(b64decodeHtml(m.aFaire?.contenu));
                          const seanceHtml = sanitizeHtmlBasic(
                            b64decodeHtml(m.contenuDeSeance?.contenu),
                          );
                          return (
                            <div
                              key={m.id}
                              className="rounded-lg border p-4 bg-white text-black border-gray-300"
                            >
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <div className="font-semibold">{m.matiere}</div>
                                <span className="text-sm text-gray-800">{m.nomProf}</span>
                                {m.interrogation ? (
                                  <span className="text-xs rounded-full bg-yellow-300 text-black px-2 py-0.5">
                                    Interrogation
                                  </span>
                                ) : null}
                              </div>

                              {aFaireHtml && (
                                <div className="mb-2">
                                  <div className="text-sm font-semibold mb-1 text-black">
                                    Travail à faire
                                  </div>
                                  <div
                                    className="text-sm leading-relaxed text-black"
                                    dangerouslySetInnerHTML={{ __html: aFaireHtml }}
                                  />
                                </div>
                              )}

                              {m.aFaire?.documents?.length ? (
                                <div className="mb-2">
                                  <div className="text-sm font-semibold mb-1 text-black">
                                    Pièces jointes
                                  </div>
                                  <ul className="list-disc pl-5 text-sm text-black">
                                    {m.aFaire.documents.map((f) => (
                                      <li key={f.id}>
                                        {f.libelle}{' '}
                                        <span className="text-gray-800 text-xs">
                                          ({Math.round(f.taille / 1024)} Ko)
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {seanceHtml && (
                                <div className="mt-2">
                                  <div className="text-sm font-semibold mb-1 text-black">
                                    Contenu de séance
                                  </div>
                                  <div
                                    className="text-sm leading-relaxed text-black"
                                    dangerouslySetInnerHTML={{ __html: seanceHtml }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Réponse brute */}
        <section className="rounded-2xl border p-6 space-y-3 border-gray-300 bg-white/60 backdrop-blur">
          <h2 className="text-lg font-semibold text-black">Réponse brute</h2>
          <pre className="text-xs overflow-auto p-4 rounded-xl bg-gray-900 text-gray-100 font-mono leading-relaxed border border-gray-700">
            {JSON.stringify(raw, null, 2)}
          </pre>
        </section>
      </div>
    </main>
  );
}
