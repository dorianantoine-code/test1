// app/ed/qcm/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type StartResp = {
  ok: boolean;
  status: number;
  data: any;
};

type AnswerResp = {
  ok: boolean;
  status: number;
  data: any;
};

type LoginResp = {
  ok: boolean;
  status: number;
  code?: number;
  message?: string;
  token?: string;
  data: any;
};

// --- Helpers Base64 (tolérants: enlève espaces/CRLF, gère URL-safe) ---
function b64clean(s: string) {
  return s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
}
function b64decodeSafe(s?: string | null): string | undefined {
  if (!s) return undefined;
  try {
    const cleaned = b64clean(s);
    // Padding
    const pad = cleaned.length % 4 ? 4 - (cleaned.length % 4) : 0;
    const padded = cleaned + '='.repeat(pad);
    // atob est dispo côté client
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(padded), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
  } catch {
    return undefined;
  }
}

// Essaie d'extraire question + propositions, et décode Base64 si nécessaire
function extractQcm(root: any): {
  decodedQuestion?: string;
  items: Array<{ base64: string; label?: string }>;
} {
  const out: { decodedQuestion?: string; items: Array<{ base64: string; label?: string }> } = {
    items: [],
  };
  if (!root) return out;

  // La doc indique data.question (b64) + data.propositions (array b64) sur /start
  // https://github.com/EduWireApps/ecoledirecte-api-docs#login (section QCM)
  // => On checke d'abord ces clés "canoniques"
  const canonical = root?.data ?? root;
  const qB64 = canonical?.question;
  const arr = canonical?.propositions;

  if (typeof qB64 === 'string') {
    out.decodedQuestion = b64decodeSafe(qB64);
  }

  if (Array.isArray(arr) && arr.length > 0) {
    // cas le plus courant: tableau de strings base64
    if (typeof arr[0] === 'string') {
      for (const s of arr as string[]) {
        if (!s) continue;
        out.items.push({ base64: s, label: b64decodeSafe(s) });
      }
      return out;
    }
    // sinon, parfois objets { choix: "<b64>", label?: "<b64>" }
    for (const it of arr) {
      const b64 = it?.choix ?? it?.value ?? it?.val ?? it?.id ?? it?.key ?? '';
      if (typeof b64 === 'string' && b64) {
        const decoded = b64decodeSafe(b64);
        // si le label est aussi encodé:
        const maybeLabel = it?.label ?? it?.titre ?? it?.text ?? it?.name;
        const decodedLabel =
          typeof maybeLabel === 'string' ? b64decodeSafe(maybeLabel) ?? maybeLabel : decoded;
        out.items.push({ base64: b64, label: decodedLabel });
      }
    }
    if (out.items.length) return out;
  }

  // Fallback agressif: fouille tout l'objet pour trouver un tableau plausible de b64
  const stack: any[] = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      if (cur.length > 0) {
        if (typeof cur[0] === 'string') {
          for (const s of cur as string[]) {
            const t = (s || '').trim();
            if (t) out.items.push({ base64: t, label: b64decodeSafe(t) });
          }
          if (out.items.length) return out;
        } else if (typeof cur[0] === 'object' && cur[0] !== null) {
          for (const it of cur) {
            const b64 = it?.choix ?? it?.value ?? it?.val ?? it?.id ?? it?.key ?? '';
            if (typeof b64 === 'string' && b64) {
              const decoded = b64decodeSafe(b64);
              const maybeLabel = it?.label ?? it?.titre ?? it?.text ?? it?.name;
              const decodedLabel =
                typeof maybeLabel === 'string' ? b64decodeSafe(maybeLabel) ?? maybeLabel : decoded;
              out.items.push({ base64: b64, label: decodedLabel });
            } else {
              stack.push(it);
            }
          }
          if (out.items.length) return out;
        } else {
          for (const it of cur) stack.push(it);
        }
      }
      continue;
    }

    if (typeof cur === 'object') {
      // attrape question si on la croise ailleurs
      if (!out.decodedQuestion && typeof cur.question === 'string') {
        out.decodedQuestion = b64decodeSafe(cur.question) ?? cur.question;
      }
      for (const v of Object.values(cur)) {
        if (v && (typeof v === 'object' || Array.isArray(v))) stack.push(v);
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
    } catch {
      // ignore
    }
  }, []);

  const extracted = useMemo(() => {
    const root = rawStart?.data?.data ?? rawStart?.data ?? rawStart;
    return extractQcm(root);
  }, [rawStart]);

  useEffect(() => {
    setQuestion(extracted.decodedQuestion);
    setPropositions(extracted.items);
  }, [extracted]);

  useEffect(() => {
    (async () => {
      if (!tempToken) return; // attend que le state soit rempli
      setLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/ed/qcm/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: tempToken,
            cookieHeader: cookieHeader || undefined,
          }),
        });

        const json: StartResp = await res.json();
        if (!json.ok) {
          throw new Error(`QCM start a échoué (status ${json.status})`);
        }

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

  async function submitChoix(base64Choix: string) {
    setLoading(true);
    setError(null);

    try {
      if (!tempToken) throw new Error('Token temporaire manquant.');
      const res = await fetch('/api/ed/qcm/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tempToken,
          choix: base64Choix, // IMPORTANT: on renvoie la valeur base64
          cookieHeader: cookieHeader || undefined,
        }),
      });
      const json: AnswerResp = await res.json();
      if (!json.ok) throw new Error(`QCM answer échoué (status ${json.status})`);

      // 1) Token direct ?
      const directToken = json.data?.token || json.data?.data?.token || undefined;

      if (directToken) {
        sessionStorage.setItem('ed_token', directToken);
        sessionStorage.setItem('ed_login_data', JSON.stringify(json.data ?? {}));
        cleanupTemp();
        router.push('/dashboard');
        return;
      }

      const raw = json.data?.data ?? json.data;

      // 2) Relogin avec fa (cn/cv)
      let fa: Array<{ cn: string; cv: string }> = [];
      if (Array.isArray(raw?.fa) && raw.fa.length) {
        fa = raw.fa
          .map((x: any) => ({ cn: String(x.cn ?? ''), cv: String(x.cv ?? '') }))
          .filter((x) => x.cn && x.cv);
      } else if (raw?.cn && raw?.cv) {
        fa = [{ cn: String(raw.cn), cv: String(raw.cv) }];
      }

      if (!fa.length) {
        throw new Error("Réponse QCM inattendue: ni token direct, ni 'fa' (cn/cv).");
      }

      if (!username || !password || !gtk) {
        throw new Error('Identifiants ou GTK manquants pour relancer le login après QCM.');
      }

      const relog = await fetch('/api/ed/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          gtk,
          cookieHeader: cookieHeader || undefined,
          fa,
        }),
      });

      const relogJson: LoginResp = await relog.json();
      if (!relogJson.ok || relogJson.code !== 200) {
        throw new Error(
          relogJson.message ||
            `Relogin après QCM refusé (status ${relogJson.status}, code ${relogJson.code}).`,
        );
      }

      const finalToken = relogJson.token || relogJson.data?.token || undefined;
      if (!finalToken) {
        throw new Error('Token introuvable après relogin QCM.');
      }

      sessionStorage.setItem('ed_token', finalToken);
      sessionStorage.setItem('ed_login_data', JSON.stringify(relogJson.data ?? {}));
      cleanupTemp();
      router.push('/dashboard');
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
      sessionStorage.removeItem('ed_cookie');
      sessionStorage.removeItem('ed_gtk');
    } catch {
      // ignore
    }
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Double authentification (QCM)</h1>
          {question && (
            <p className="text-sm text-gray-700 mt-2">
              <span className="font-medium">Question :</span> <span>{question}</span>
            </p>
          )}
          {!question && (
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

        {/* Bloc debug pliable pour voir la réponse brute */}
        {!loading && (
          <details className="rounded-2xl border p-4">
            <summary className="cursor-pointer text-sm">Debug : réponse /start (JSON brut)</summary>
            <pre className="text-xs overflow-auto mt-3 bg-gray-50 p-3 rounded-xl">
              {JSON.stringify(rawStart, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
