// app/ed/qcm/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertFromEdResponse } from '../../lib/ed/upsertClient'; // chemin RELATIF

type StartResp = { ok: boolean; status: number; data: any };
type AnswerResp = { ok: boolean; status: number; data: any };
type LoginResp = {
  ok: boolean;
  status: number;
  code?: number;
  message?: string;
  token?: string;
  data: any;
};

// --- Helpers Base64 (pour afficher la question/réponses lisibles) ---
function b64decodeSafe(s?: string | null): string | undefined {
  if (!s) return undefined;
  try {
    const cleaned = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = cleaned.length % 4 ? 4 - (cleaned.length % 4) : 0;
    const padded = cleaned + '='.repeat(pad);
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return undefined;
  }
}

function extractQcm(root: any): {
  decodedQuestion?: string;
  items: Array<{ base64: string; label?: string }>;
} {
  const out = {
    decodedQuestion: undefined as string | undefined,
    items: [] as Array<{ base64: string; label?: string }>,
  };
  if (!root) return out;
  const canonical = root?.data ?? root;
  const qB64 = canonical?.question;
  const arr = canonical?.propositions;

  if (typeof qB64 === 'string') out.decodedQuestion = b64decodeSafe(qB64);

  if (Array.isArray(arr)) {
    if (typeof arr[0] === 'string') {
      for (const s of arr) if (s) out.items.push({ base64: s, label: b64decodeSafe(s) });
    } else {
      for (const it of arr) {
        const b64 = it?.choix ?? it?.value ?? it?.val ?? it?.id ?? it?.key ?? '';
        if (typeof b64 === 'string' && b64) {
          const maybeLabel = it?.label ?? it?.titre ?? it?.text ?? it?.name;
          const decodedLabel =
            typeof maybeLabel === 'string'
              ? b64decodeSafe(maybeLabel) ?? maybeLabel
              : b64decodeSafe(b64);
          out.items.push({ base64: b64, label: decodedLabel });
        }
      }
    }
  }
  return out;
}

export default function QcmPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawStart, setRawStart] = useState<any>(null);
  const [rawAnswer, setRawAnswer] = useState<any>(null);

  const [question, setQuestion] = useState<string | undefined>(undefined);
  const [propositions, setPropositions] = useState<Array<{ base64: string; label?: string }>>([]);

  // Contexte stocké en session par la page de login
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [cookieHeader, setCookieHeader] = useState<string | null>(null);
  const [gtk, setGtk] = useState<string | null>(null);

  useEffect(() => {
    try {
      setTempToken(sessionStorage.getItem('ed_temp_token'));
      setUsername(sessionStorage.getItem('ed_username'));
      setPassword(sessionStorage.getItem('ed_password'));
      setCookieHeader(sessionStorage.getItem('ed_cookie'));
      setGtk(sessionStorage.getItem('ed_gtk'));
    } catch {}
  }, []);

  const extracted = useMemo(() => {
    const root = rawStart?.data?.data ?? rawStart?.data ?? rawStart;
    return extractQcm(root);
  }, [rawStart]);

  useEffect(() => {
    setQuestion(extracted.decodedQuestion);
    setPropositions(extracted.items);
  }, [extracted]);

  // Récupère la question
  useEffect(() => {
    (async () => {
      if (!tempToken) return;
      setLoading(true);
      setError(null);

      try {
        console.log('[QCM][client] start call', {
          hasToken: !!tempToken,
          tokenPrefix: String(tempToken).slice(0, 8),
          tokenLen: String(tempToken).length,
          hasCookie: !!cookieHeader,
          cookieLen: cookieHeader ? cookieHeader.length : 0,
          hasGtk: !!gtk,
          gtkLen: gtk ? gtk.length : 0,
        });

        const res = await fetch('/api/ed/qcm/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: tempToken,
            cookieHeader: cookieHeader || undefined,
            gtk: gtk || undefined,
          }),
        });

        const json: StartResp = await res.json();
        if (!json.ok) throw new Error(`QCM start a échoué (status ${json.status})`);

        console.log('[QCM][client] start resp', {
          status: json.status,
          keys: Object.keys(json?.data || {}),
          code: json?.data?.code,
          token: json?.data?.token,
          hasData: !!json?.data?.data,
          nestedKeys: json?.data?.data ? Object.keys(json.data.data) : [],
        });

        setRawStart(json);

        const { items } = extractQcm(json?.data?.data ?? json.data);
        if (!items.length) {
          setPropositions([]);
          setError('Aucune proposition QCM trouvée dans la réponse.');
        } else {
          setError(null);
          setPropositions(items);
        }
      } catch (e: any) {
        setError(e?.message || 'Erreur au chargement du QCM.');
      } finally {
        setLoading(false);
      }
    })();
  }, [tempToken, cookieHeader]);

  // Soumission d’un choix
  async function submitChoix(choiceBase64: string) {
    setLoading(true);
    setError(null);

    try {
      if (!tempToken) throw new Error('Token temporaire manquant.');
      const res = await fetch('/api/ed/qcm/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tempToken,
          choix: choiceBase64, // NE PAS MODIFIER
          cookieHeader: cookieHeader || undefined,
          gtk: gtk || undefined,
        }),
      });
      const json: AnswerResp = await res.json();
      setRawAnswer(json);
      if (!json.ok) throw new Error(`QCM answer échoué (status ${json.status})`);

      console.log('[QCM][client] answer resp', {
        status: json.status,
        keys: Object.keys(json?.data || {}),
        code: json?.data?.code,
        token: json?.data?.token,
        hasData: !!json?.data?.data,
        nestedKeys: json?.data?.data ? Object.keys(json.data.data) : [],
      });

      console.warn('[QCM] Upsert 1/2 → depuis réponse /answer');
      await upsertFromEdResponse(json); // <-- upsert #1 (si la réponse contient account)
      console.warn('[QCM] Upsert 1/2 terminé');

      // 1) Token direct ?
      const directToken = json.data?.token || json.data?.data?.token;
      if (typeof directToken === 'string' && directToken) {
        sessionStorage.setItem('ed_token', directToken);
        sessionStorage.setItem('ed_login_data', JSON.stringify(json.data ?? {}));
        cleanupTemp();

        // par sûreté: upsert (au cas où la structure soit différente ici)
        console.warn('[QCM] Upsert sécurité après token direct (2/2)');
        await upsertFromEdResponse(json); // <-- upsert #2 fallback
        return router.push('/ed/eleves');
      }

      // 2) Relogin avec fa (cn/cv) — UTILISER LES VALEURS TELLES QUELLES
      const root = json.data?.data ?? json.data;
      let faRaw: Array<{ cn: string; cv: string }> = [];

      if (Array.isArray(root?.fa) && root.fa.length) {
        faRaw = root.fa
          .map((x: any) => {
            const cn = String(x?.cn ?? '');
            const cv = String(x?.cv ?? '');
            return cn && cv ? { cn, cv } : null;
          })
          .filter(Boolean) as Array<{ cn: string; cv: string }>;
      } else if (root?.cn && root?.cv) {
        faRaw = [{ cn: String(root.cn), cv: String(root.cv) }];
      }

      if (!faRaw.length)
        throw new Error("Réponse QCM inattendue: ni token direct, ni 'fa' (cn/cv).");
      if (!username || !password || !gtk)
        throw new Error('Identifiants ou GTK manquants pour relancer le login après QCM.');

      // Log client (debug)
      console.log('[QCM] Relog /api/ed/login', {
        hasUser: !!username,
        hasPwd: !!password,
        hasGtk: !!gtk,
        faCount: faRaw.length,
      });

      const relog = await fetch('/api/ed/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          gtk,
          cookieHeader: cookieHeader || undefined,
          fa: faRaw, // RAW, sans nettoyage
        }),
      });

      const relogJson: LoginResp = await relog.json();
      if (!relogJson.ok || relogJson.code !== 200) {
        throw new Error(
          relogJson.message ||
            `Relogin après QCM refusé (status ${relogJson.status}, code ${relogJson.code}).`,
        );
      }

      const finalToken = relogJson.token || relogJson.data?.token;
      if (!finalToken) throw new Error('Token introuvable après relogin QCM.');

      // ➜ Upsert après relogin (réponse login standard contient quasi toujours "accounts")
      console.warn('[QCM] Upsert 2/2 → depuis réponse relogin');
      await upsertFromEdResponse(relogJson); // <-- upsert #2 (fortement probable)
      console.warn('[QCM] Upsert 2/2 terminé');

      sessionStorage.setItem('ed_token', finalToken);
      sessionStorage.setItem('ed_login_data', JSON.stringify(relogJson.data ?? {}));
      if (relogJson.cookieHeader || cookieHeader) {
        sessionStorage.setItem('ed_cookie_persist', relogJson.cookieHeader || cookieHeader || '');
      }
      cleanupTemp();
      router.push('/ed/eleves');
    } catch (e: any) {
      setError(e?.message || 'Erreur lors de la soumission du QCM.');
    } finally {
      setLoading(false);
    }
  }

  function cleanupTemp() {
    try {
      sessionStorage.removeItem('ed_temp_token');
      sessionStorage.removeItem('ed_username');
      sessionStorage.removeItem('ed_password');
      sessionStorage.removeItem('ed_cookie'); // on garde ed_cookie_persist pour réutiliser la session
      sessionStorage.removeItem('ed_gtk');
    } catch {}
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Double authentification (QCM)</h1>
          {question ? (
            <p className="text-sm text-gray-700 mt-2">
              <span className="font-medium">Question :</span> <span>{question}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-2">
              La question n’a pas été fournie (ou n’était pas encodée en base64).
            </p>
          )}
        </header>

        {loading && <div className="rounded-2xl border p-6">Chargement…</div>}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && propositions.length > 0 && (
          <section className="rounded-2xl border p-6 space-y-3">
            <h2 className="text-lg font-medium">Choisissez une réponse</h2>
            <div className="flex flex-col gap-3">
              {propositions.map((p, idx) => (
                <button
                  key={p.base64 || idx}
                  className="text-left rounded-xl border px-4 py-3 hover:bg-gray-50"
                  onClick={() => submitChoix(p.base64)}
                >
                  {p.label || `Proposition ${idx + 1}`}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Debug: réponses brutes */}
        {!loading && (
          <>
            <details className="rounded-2xl border p-4">
              <summary className="cursor-pointer text-sm">
                Debug : réponse /start (JSON brut)
              </summary>
              <pre className="text-xs overflow-auto mt-3 bg-gray-50 p-3 rounded-xl">
                {JSON.stringify(rawStart, null, 2)}
              </pre>
            </details>

            {rawAnswer && (
              <details className="rounded-2xl border p-4">
                <summary className="cursor-pointer text-sm">
                  Debug : réponse /answer (JSON brut)
                </summary>
                <pre className="text-xs overflow-auto mt-3 bg-gray-50 p-3 rounded-xl">
                  {JSON.stringify(rawAnswer, null, 2)}
                </pre>
              </details>
            )}
          </>
        )}
      </div>
    </main>
  );
}
