'use client';

/**
 * À appeler immédiatement après la sélection d'un élève.
 * - `eleve` : l'objet élève tel que déjà affiché dans ta page
 * - `ed_account_id` : on essaie d'abord de le déduire depuis sessionStorage (ed_login_data),
 *   mais tu peux le passer en second argument si tu l'as sous la main.
 */
export async function upsertSelectedEleve(eleve: any, ed_account_id?: string) {
  try {
    let accountId = ed_account_id;
    let etablissement: string | undefined;

    // Tentative d'extraction depuis le login_data en sessionStorage
    if (!accountId) {
      try {
        const raw = sessionStorage.getItem('ed_login_data');
        if (raw) {
          const login = JSON.parse(raw);
          const acc =
            login?.accounts?.[0] ??
            login?.data?.accounts?.[0] ??
            login?.data?.account ??
            null;
          const id =
            acc?.id ??
            acc?.idCompte ??
            acc?.compteId ??
            null;
          if (id) accountId = String(id);
          etablissement =
            acc?.etablissement?.nom ??
            acc?.etablissement ??
            acc?.profile?.nomEtablissement ??
            undefined;
        }
      } catch {}
    }

    // fallback: etab directement sur l'élève
    if (!etablissement) {
      etablissement =
        eleve?.etablissement?.nom ??
        eleve?.etablissement ??
        eleve?.nomEtablissement ??
        undefined;
    }

    const res = await fetch('/api/ed/eleve/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eleve,
        ed_account_id: accountId,
        etablissement,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      console.error('[EleveUpsertClient] échec upsert', { status: res.status, payload: json });
      return false;
    }

    // OK
    return true;
  } catch (e: any) {
    console.error('[EleveUpsertClient] erreur', e?.message || e);
    return false;
  }
}
