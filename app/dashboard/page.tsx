// app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type LoginData = { account?: any; accounts?: any[]; token?: string };

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [loginData, setLoginData] = useState<LoginData | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('ed_token');
      const d = sessionStorage.getItem('ed_login_data');
      const sid = sessionStorage.getItem('ed_selected_eleve_id');
      const sname = sessionStorage.getItem('ed_selected_eleve_name');
      const sphoto = sessionStorage.getItem('ed_selected_eleve_photo');
      setToken(t);
      setLoginData(d ? JSON.parse(d) : null);
      setSelectedId(sid ? Number(sid) : null);
      setSelectedName(sname || null);
      setSelectedPhoto(sphoto || null);
    } catch {}
  }, []);

  // Redirections
  useEffect(() => {
    if (token === null) return;
    if (!token) router.replace('/');
  }, [token, router]);

  useEffect(() => {
    if (selectedId === null) return;
    if (!selectedId) router.replace('/ed/eleves');
  }, [selectedId, router]);

  function absolutePhoto(src?: string | null) {
    if (!src) return undefined;
    if (src.startsWith('//')) return 'https:' + src;
    return src;
  }
  function proxiedPhoto(src?: string | null) {
    const abs = absolutePhoto(src || undefined);
    if (!abs) return undefined;
    if (abs.startsWith('http')) return `/api/ed/img?u=${encodeURIComponent(abs)}`;
    return abs;
  }

  function prettyPrintJson(obj: any) {
    if (!obj) return '';
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/"(.*?)":/g, '<span class="text-blue-400">"$1"</span>:')
      .replace(/: "(.*?)"/g, ': <span class="text-green-300">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="text-purple-300">$1</span>')
      .replace(/: (true|false)/g, ': <span class="text-orange-300">$1</span>');
  }

  const headerText = useMemo(() => {
    if (selectedId && selectedName) return `Dashboard — Élève ${selectedName} (#${selectedId})`;
    if (selectedId) return `Dashboard — Élève #${selectedId}`;
    return 'Dashboard';
  }, [selectedId, selectedName]);

  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {selectedPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxiedPhoto(selectedPhoto)}
                alt={selectedName || 'Élève'}
                className="h-10 w-10 rounded-full border border-white/40 bg-white/20 object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight text-white">{headerText}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/ed/eleves"
              className="rounded-xl border px-4 py-2 text-white border-white/40 hover:bg-white/10"
            >
              Changer d’élève
            </Link>
            <Link href="/ed/agenda" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
              Agenda
            </Link>
            <Link href="/ed/cdt" className="rounded-xl border px-4 py-2 hover:bg-gray-50">
              Cahier de texte
            </Link>
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
                {selectedId ? (
                  <div className="mb-2 font-mono">
                    <span className="font-semibold">Élève sélectionné:</span>{' '}
                    <span className="select-all">
                      #{selectedId} {selectedName ? `(${selectedName})` : ''}
                    </span>
                  </div>
                ) : null}
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
                dangerouslySetInnerHTML={{ __html: prettyPrintJson(loginData) }}
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}
