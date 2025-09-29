'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Identity = {
  id: number | string;
  type?: string;
  nom?: string;
  prenom?: string;
  classe?: string;
};

export default function AccountPage() {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('ed_identity');
    if (raw) {
      try {
        setIdentity(JSON.parse(raw));
      } catch {
        setIdentity(null);
      }
    }
  }, []);

  if (!identity) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border p-6">
          <p>Aucune donnée de session. </p>
          <button onClick={() => router.push('/')} className="mt-3 underline">
            Revenir à la connexion
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-bold mb-4">Compte École Directe</h1>
        <ul className="space-y-1">
          <li>
            <b>ID:</b> {String(identity.id)}
          </li>
          <li>
            <b>Type:</b> {identity.type ?? '?'}
          </li>
          <li>
            <b>Nom:</b> {identity.nom ?? '?'}
          </li>
          <li>
            <b>Prénom:</b> {identity.prenom ?? '?'}
          </li>
          {identity.classe && (
            <li>
              <b>Classe:</b> {identity.classe}
            </li>
          )}
        </ul>
        <button
          onClick={() => router.push('/')}
          className="mt-4 rounded-md px-3 py-2 bg-gray-200 hover:bg-gray-300"
        >
          Retour
        </button>
      </div>
    </main>
  );
}
