// app/ed/cdt/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type CdtResponse = { ok: boolean; status: number; data: any };
type CdtDayResponse = { ok: boolean; status: number; data: any };

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

  return null;
}

function b64decodeHtml(b64?: string): string | undefined {
  if (!b64 || typeof b64 !== 'string') return undefined;
  try {
    const s = b64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
    const padded = s + '='.repeat(pad);
    // decode base64 → utf-8 string
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

/** Sanitisation très simple (dev) : supprime scripts et attributs on* */
function sanitizeHtmlBasic(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

type DevoirLight = {
  matiere: string;
  codeMatiere: string;
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
    codeMatiere: string;
    nomProf: string;
    id: number; // = idDevoir
    interrogation: boolean;
    nbJourMaxRenduDevoir?: number;
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
        type: string; // "FICHIER_CDT"
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

export default function CdtPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<any>(null);
  const [eleveId, setEleveId] = useState<number | null>(null);
  const [eleveNomComplet, setEleveNomComplet] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);

  // détails par date
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [dayData, setDayData] = useState<Record<string, DayDetail | null>>({});

  // Récupère token + élève
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

      console.log('[CDT] Session snapshot', {
        hasToken: !!t,
        foundEleve: e,
        primaryPathId: parsed?.data?.accounts?.[0]?.profile?.eleves?.[0]?.id,
      });
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
      if (!eleveId) throw new Error('Identifiant élève introuvable dans les données de session.');

      console.log('[CDT] Request /api/ed/cdt', { eleveId });

      const res = await fetch('/api/ed/cdt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          eleveId,
          // cookieHeader: sessionStorage.getItem("ed_cookie") || undefined,
        }),
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

  // Transforme la réponse "map par date" → tableau trié
  const itemsByDate = useMemo(() => {
    const payload = raw?.data ?? raw;
    const map = payload && typeof payload === 'object' ? payload : {};
    const dates = Object.keys(map).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    dates.sort();
    const arr = dates.map((date) => {
      const list: DevoirLight[] = Array.isArray(map[date]) ? map[date] : [];
      return { date, list };
    });
    return arr;
  }, [raw]);

  // Détail d'un jour
  async function toggleDay(date: string) {
    setDayError(null);
    if (openDate === date) {
      setOpenDate(null);
      return;
    }
    setOpenDate(date);

    // charge si pas déjà présent
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
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Cahier de texte</h1>
            <p className="text-sm text-gray-500">{headerEleve}</p>
          </div>
          <Link href="/dashboard" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
            ← Retour
          </Link>
        </header>

        <form onSubmit={loadCdt} className="rounded-2xl border p-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !eleveId}
            className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
            title={!eleveId ? 'Élève introuvable dans la session' : 'Recharger'}
          >
            {loading ? 'Chargement…' : 'Recharger'}
          </button>
          <span className="text-xs text-gray-500">
            Liste des devoirs à faire à partir d’aujourd’hui (groupés par date).
          </span>
        </form>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* LISTE LISIBLE */}
        <section className="rounded-2xl border p-4 space-y-4">
          <h2 className="text-lg font-medium">À faire (lisible)</h2>

          {itemsByDate.length === 0 && !loading && (
            <div className="text-sm text-gray-500">Aucun devoir à venir.</div>
          )}

          <div className="space-y-4">
            {itemsByDate.map(({ date, list }) => (
              <div key={date} className="border rounded-xl">
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 flex items-center justify-between"
                  onClick={() => toggleDay(date)}
                >
                  <span className="font-medium">
                    {new Date(date).toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                    })}
                  </span>
                  <span className="text-sm text-gray-500">
                    {list.length} élément{list.length > 1 ? 's' : ''}
                  </span>
                </button>

                {/* liste simple */}
                <div className="px-4 pb-3 space-y-2">
                  {list.map((d) => (
                    <div
                      key={`${date}-${d.idDevoir}`}
                      className="rounded-lg border p-3 flex flex-col gap-1 bg-gray-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{d.matiere}</span>
                        <span className="text-xs rounded-full bg-gray-200 px-2 py-0.5">
                          {d.codeMatiere}
                        </span>
                        {d.interrogation ? (
                          <span className="text-xs rounded-full bg-amber-200 px-2 py-0.5">
                            Interrogation
                          </span>
                        ) : null}
                        {d.rendreEnLigne ? (
                          <span className="text-xs rounded-full bg-indigo-200 px-2 py-0.5">
                            Rendu en ligne
                          </span>
                        ) : null}
                        {d.effectue ? (
                          <span className="text-xs rounded-full bg-emerald-200 px-2 py-0.5">
                            Effectué
                          </span>
                        ) : (
                          <span className="text-xs rounded-full bg-rose-200 px-2 py-0.5">
                            À faire
                          </span>
                        )}
                      </div>
                      {d.donneLe && (
                        <div className="text-xs text-gray-600">
                          Donné le <b>{new Date(d.donneLe).toLocaleDateString('fr-FR')}</b>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* détails jour */}
                {openDate === date && (
                  <div className="border-t px-4 py-4 space-y-4">
                    {dayLoading && <div className="text-sm">Chargement du détail…</div>}
                    {dayError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
                            <div key={m.id} className="rounded-lg border p-4">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <div className="font-medium">{m.matiere}</div>
                                <span className="text-xs rounded-full bg-gray-200 px-2 py-0.5">
                                  {m.codeMatiere}
                                </span>
                                <span className="text-xs text-gray-500">{m.nomProf}</span>
                                {m.interrogation ? (
                                  <span className="text-xs rounded-full bg-amber-200 px-2 py-0.5">
                                    Interrogation
                                  </span>
                                ) : null}
                              </div>

                              {aFaireHtml && (
                                <div className="mb-2">
                                  <div className="text-sm font-medium mb-1">Travail à faire</div>
                                  <div
                                    className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                                    dangerouslySetInnerHTML={{ __html: aFaireHtml }}
                                  />
                                </div>
                              )}

                              {m.aFaire?.documents?.length ? (
                                <div className="mb-2">
                                  <div className="text-sm font-medium mb-1">Pièces jointes</div>
                                  <ul className="list-disc pl-5 text-sm">
                                    {m.aFaire.documents.map((f) => (
                                      <li key={f.id}>
                                        {f.libelle}{' '}
                                        <span className="text-gray-500 text-xs">
                                          ({Math.round(f.taille / 1024)} Ko)
                                        </span>
                                        {/* Pour le téléchargement, on pourra ajouter un proxy:
                                            /api/ed/download?type=FICHIER_CDT&id={f.id}
                                            (voir doc telechargement) */}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {seanceHtml && (
                                <div className="mt-2">
                                  <div className="text-sm font-medium mb-1">Contenu de séance</div>
                                  <div
                                    className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
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

        {/* Réponse brute (debug) */}
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
