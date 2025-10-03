// components/DevoirsPanel.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type EdCdtItem = {
  matiere?: string;
  codeMatiere?: string;
  aFaire?: boolean;
  idDevoir: number;
  documentsAFaire?: boolean;
  donneLe?: string;
  effectue?: boolean;
  interrogation?: boolean;
  rendreEnLigne?: boolean;
  // ED peut renvoyer d'autres champs : ils resteront dans `raw` côté serveur
};

type EdCdtData = Record<string, EdCdtItem[]>; // { "YYYY-MM-DD": [ {...}, ... ] }

type EdCdtResponse = {
  code?: number;
  message?: string;
  data?: any;
  cahierDeTexte?: any;
  result?: any;
};

function getTokenAndEleveId() {
  let token: string | null = null;
  let eleveId: number | null = null;

  try {
    // clés directes (adapte si tes clés diffèrent)
    token = sessionStorage.getItem('ed_token');
    const eleveIdStr = sessionStorage.getItem('ed_selected_eleve_id');
    if (eleveIdStr) eleveId = Number(eleveIdStr);

    // fallback: paquet de login sérialisé
    if (!token) {
      const raw = sessionStorage.getItem('ed_login_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        token = parsed?.token ?? parsed?.data?.token ?? null;
      }
    }

    // fallback: paquet élève sérialisé
    if (!eleveId) {
      const rawEleve = sessionStorage.getItem('selected_eleve');
      if (rawEleve) {
        const parsedEleve = JSON.parse(rawEleve);
        eleveId =
          Number(parsedEleve?.ed_eleve_id ?? parsedEleve?.id ?? parsedEleve?.eleveId) || null;
      }
    }
  } catch {
    // ignore
  }

  return { token, eleveId };
}

export default function DevoirsPanel() {
  const [{ token, eleveId }, setAuth] = useState(getTokenAndEleveId);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EdCdtResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastSyncedKeyRef = useRef<string | null>(null);

  // réagir si d'autres parties de l'app changent le storage (sélection élève, relogin, etc.)
  useEffect(() => {
    const onStorage = () => setAuth(getTokenAndEleveId());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const disabled = useMemo(() => !token || !eleveId, [token, eleveId]);

  // Charger le CDT via la route existante /api/ed/cdt (inchangé)
  useEffect(() => {
    let abort = false;

    async function load() {
      if (disabled) return;
      setLoading(true);
      setError(null);
      setPayload(null);

      try {
        const res = await fetch('/api/ed/cdt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, eleveId }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }

        const json: EdCdtResponse = await res.json();

        // Codes ED fréquents : 200 OK, 250 (2FA), 520 token invalide...
        if (json?.code && json.code !== 200) {
          throw new Error(json.message || `Erreur ED code=${json.code}`);
        }

        if (!abort) setPayload(json);
      } catch (e: any) {
        if (!abort) setError(e?.message || 'Erreur de chargement des devoirs');
      } finally {
        if (!abort) setLoading(false);
      }
    }

    load();
    return () => {
      abort = true;
    };
  }, [token, eleveId, disabled]);

  // Normaliser l'objet pour l'affichage et la sync
  const normalized: EdCdtData | null = useMemo(() => {
    if (!payload) return null;
    const root =
      payload?.cahierDeTexte ??
      payload?.data?.cahierDeTexte ??
      payload?.data ??
      payload?.result ??
      payload;
    // On s'attend ici à { "YYYY-MM-DD": [ ... ] }
    if (root && typeof root === 'object') return root as EdCdtData;
    return null;
  }, [payload]);

  // Sync automatique vers Supabase dès que normalized est dispo
  useEffect(() => {
    if (!eleveId || !normalized) return;

    // petit hash pour éviter les re-sync inutiles si rien n'a changé
    function hash(obj: unknown) {
      try {
        const str = JSON.stringify(obj);
        let h = 5381;
        for (let i = 0; i < str.length; i++) {
          h = (h * 33) ^ str.charCodeAt(i);
        }
        return `${eleveId}:${(h >>> 0).toString(36)}`;
      } catch {
        return `${eleveId}:nohash`;
      }
    }

    const key = hash(normalized);
    if (lastSyncedKeyRef.current === key) return;

    let aborted = false;

    (async () => {
      try {
        setSyncError(null);
        const res = await fetch('/api/devoir/sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            eleveId,
            cdtData: normalized, // on pousse ce qu'on affiche
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!aborted) {
          lastSyncedKeyRef.current = key;
          // Optionnel: console.debug("Sync devoir OK", json);
        }
      } catch (e: any) {
        if (!aborted) setSyncError(e?.message || 'Erreur sync devoirs');
      }
    })();

    return () => {
      aborted = true;
    };
  }, [eleveId, normalized]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Devoirs (CDT)</h2>
        <div className="text-sm opacity-70">
          {eleveId ? `Élève #${eleveId}` : 'Élève non sélectionné'}
        </div>
      </div>

      {disabled && (
        <div className="rounded-lg border p-4">
          <p className="text-sm">
            Impossible de charger les devoirs : <strong>token</strong> ou <strong>eleveId</strong>{' '}
            manquant(s).
          </p>
          <ul className="list-disc ml-5 mt-2 text-sm">
            <li>Assure-toi d’être connecté (token ED valide).</li>
            <li>Sélectionne un élève depuis la page dédiée.</li>
          </ul>
        </div>
      )}

      {!disabled && loading && <div className="rounded-lg border p-4">Chargement des devoirs…</div>}

      {!disabled && error && (
        <div className="rounded-lg border p-4 text-red-600">Erreur : {error}</div>
      )}

      {!disabled && !loading && syncError && (
        <div className="rounded-lg border p-3 text-red-600 text-sm">
          Synchronisation Supabase : {syncError}
        </div>
      )}

      {!disabled && !loading && !error && normalized && (
        <div className="rounded-lg border p-4 overflow-x-auto">
          <pre className="text-xs md:text-sm whitespace-pre">
            {JSON.stringify(normalized, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
