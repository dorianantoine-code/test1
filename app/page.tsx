// app/page.tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { upsertFromEdResponse } from './lib/ed/upsertClient'; // ⟵ chemin RELATIF

type GtkResponse = {
  ok: boolean;
  v: string;
  gtk: string | null;
  cookieHeader: string;
  status: number;
};

type LoginResponse = {
  ok: boolean;
  status: number;
  codeHeader?: string;
  code?: number;
  message?: string;
  token?: string;
  cookieHeader?: string;
  data: any;
};

function mergeCookieHeadersClient(...headers: Array<string | null | undefined>) {
  const store = new Map<string, string>();
  for (const header of headers) {
    if (!header) continue;
    const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      if (val === '' && store.has(key)) continue;
      store.set(key, val);
    }
  }
  return Array.from(store.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'gtk' | 'login'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // tenter de réutiliser un cookie ED validé pour éviter un nouveau QCM
      const persistedCookie = sessionStorage.getItem('ed_cookie_persist') || '';

      setPhase('gtk');
      const gtkRes = await fetch('/api/ed/gtk', { cache: 'no-store' });
      const gtkJson: GtkResponse = await gtkRes.json();

      if (!gtkJson.ok || !gtkJson.gtk) {
        throw new Error('Pré-login: GTK introuvable.');
      }

      setPhase('login');
      const loginRes = await fetch('/api/ed/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          gtk: gtkJson.gtk,
          cookieHeader: mergeCookieHeadersClient(persistedCookie, gtkJson.cookieHeader),
        }),
      });
      console.warn('[UpsertClient] avant lancement');
      const loginJson: LoginResponse = await loginRes.json();
      console.warn('[UpsertClient] aprs lancement');

      if (!loginJson.ok) {
        throw new Error(loginJson.message || `Login échoué (status ${loginJson.status})`);
      }

      // ➜ INSERT/UPDATE SUPABASE
      await upsertFromEdResponse(loginJson);

      // 200 => OK: stocker token + payload et aller à la sélection d'élève
      if (loginJson.code === 200) {
        const token = loginJson.token || loginJson.data?.token;
        if (!token) throw new Error('Token absent dans la réponse (200).');

        sessionStorage.setItem('ed_token', token);
        sessionStorage.setItem('ed_login_data', JSON.stringify(loginJson.data ?? {}));
        if (loginJson.cookieHeader) {
          sessionStorage.setItem('ed_cookie_persist', loginJson.cookieHeader);
        } else if (gtkJson.cookieHeader) {
          sessionStorage.setItem('ed_cookie_persist', gtkJson.cookieHeader);
        }

        // On force une nouvelle sélection d'élève à chaque login
        sessionStorage.removeItem('ed_selected_eleve_id');
        sessionStorage.removeItem('ed_selected_eleve_name');
        sessionStorage.removeItem('ed_selected_eleve_photo');
        sessionStorage.removeItem('ed_selected_eleve_etablissement');

        router.push('/ed/eleves');
        return;
      }

      // 250 => QCM: sauvegarde du contexte et go /ed/qcm
      if (loginJson.code === 250) {
        const tempToken = loginJson.xToken || loginJson.token || loginJson.data?.token;
        if (!tempToken) {
          throw new Error('Token temporaire absent (code 250).');
        }

        // Stocker ce qu'il faut pour finir le flux QCM
        const jar = loginJson.cookieHeader || gtkJson.cookieHeader || '';
        sessionStorage.setItem('ed_temp_token', tempToken);
        sessionStorage.setItem('ed_username', username);
        sessionStorage.setItem('ed_password', password);
        sessionStorage.setItem('ed_cookie', jar);
        sessionStorage.setItem('ed_gtk', gtkJson.gtk);

        router.push('/ed/qcm');
        return;
      }

      throw new Error(loginJson.message || `Login refusé (code ${loginJson.code})`);
    } catch (err: any) {
      setError(err?.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
      setPhase('idle');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border p-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Connexion EcoleDirecte</h1>
          </header>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Identifiant</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
                placeholder="email ou identifiant"
                required
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mot de passe</label>
              <div className="relative">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 pr-10 outline-none focus:ring-2"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={passwordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                  onClick={() => setPasswordVisible((v) => !v)}
                >
                  {passwordVisible ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-black text-white py-2 disabled:opacity-50"
            >
              {loading ? (phase === 'gtk' ? 'Préparation…' : 'Connexion…') : 'Se connecter'}
            </button>
          </form>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
