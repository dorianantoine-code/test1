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
  data: any;
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'gtk' | 'login'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
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
          cookieHeader: gtkJson.cookieHeader,
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

        // On force une nouvelle sélection d'élève à chaque login
        sessionStorage.removeItem('ed_selected_eleve_id');
        sessionStorage.removeItem('ed_selected_eleve_name');
        sessionStorage.removeItem('ed_selected_eleve_photo');

        router.push('/ed/eleves');
        return;
      }

      // 250 => QCM: sauvegarde du contexte et go /ed/qcm
      if (loginJson.code === 250) {
        const tempToken = loginJson.token || loginJson.data?.token;
        if (!tempToken) {
          throw new Error('Token temporaire absent (code 250).');
        }

        // Stocker ce qu'il faut pour finir le flux QCM
        sessionStorage.setItem('ed_temp_token', tempToken);
        sessionStorage.setItem('ed_username', username);
        sessionStorage.setItem('ed_password', password);
        sessionStorage.setItem('ed_cookie', gtkJson.cookieHeader || '');
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
            <p className="text-sm text-gray-500">
              Entrez vos identifiants pour obtenir un <code>token</code>.
            </p>
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
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
