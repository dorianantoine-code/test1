// app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LoginData = {
  account?: any;
  accounts?: any[];
  token?: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<LoginData | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      setToken(t);
      setLoginData(d ? JSON.parse(d) : null);
    } catch {}
  }, []);

  // Fonction de coloration JSON (simple regexes)
  function prettyPrintJson(obj: any) {
    if (!obj) return '';
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/"(.*?)":/g, '<span class="text-blue-600">"$1"</span>:') // clés
      .replace(/: "(.*?)"/g, ': <span class="text-green-700">"$1"</span>') // valeurs string
      .replace(/: (\d+)/g, ': <span class="text-purple-700">$1</span>') // nombres
      .replace(/: (true|false)/g, ': <span class="text-orange-600">$1</span>'); // booléens
  }

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
              Déconnexion
            </Link>
          </div>
        </header>

        {!token ? (
          <div className="rounded-2xl border p-6">
            <p className="mb-3">
              Aucun <code>token</code> en session. Connecte-toi d’abord.
            </p>
            <Link href="/" className="inline-block rounded-xl bg-black text-white px-4 py-2">
              Aller à la page de connexion
            </Link>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border p-6 space-y-4">
              <h2 className="text-lg font-medium">Session</h2>
              <div className="text-sm break-all">
                <div className="mb-2 font-mono">
                  <span className="font-semibold">X-Token:</span>{' '}
                  <span className="select-all">{token}</span>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                Le token ci-dessus doit être envoyé dans <code>X-Token</code> sur toutes les
                requêtes ED suivantes.
              </div>
            </section>

            <section className="rounded-2xl border p-6 space-y-3">
              <h2 className="text-lg font-medium">Infos compte (si renvoyées)</h2>
              <pre
                className="text-xs overflow-auto p-4 rounded-xl bg-gray-900 text-gray-100 font-mono leading-relaxed border border-gray-700"
                dangerouslySetInnerHTML={{
                  __html: prettyPrintJson(loginData),
                }}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
