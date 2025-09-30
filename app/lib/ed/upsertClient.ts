'use client';

/**
 * Tente d'extraire l'objet "account" depuis différentes formes de réponses:
 * - { data: { accounts: [...] } }
 * - { data: { account: {...} } }
 * - { data: { data: { accounts: [...] } } }  // enveloppe "data" supplémentaire
 * - { data: { data: { account: {...} } } }
 * - ou même { accounts: [...] } / { account: {...} }
 */
function pickAccount(payload: any) {
  const candidates = [
    payload?.data?.accounts?.[0],
    payload?.data?.account,
    payload?.data?.data?.accounts?.[0],
    payload?.data?.data?.account,
    payload?.accounts?.[0],
    payload?.account,
  ];
  for (const c of candidates) if (c) return c;
  return null;
}

export async function upsertFromEdResponse(json: any) {
  try {
    const account = pickAccount(json);

    console.log('[UpsertClient] payload reçu', {
      hasData: !!json?.data,
      hasNestedData: !!json?.data?.data,
      hasAccountsTop: Array.isArray(json?.accounts),
      hasAccounts: Array.isArray(json?.data?.accounts) || Array.isArray(json?.data?.data?.accounts),
      hasAccountTop: !!json?.account,
      hasAccount: !!json?.data?.account || !!json?.data?.data?.account,
    });

    if (!account) {
      console.warn('[UpsertClient] Aucun "account" trouvé → upsert ignoré.');
      return;
    }

    console.log('[UpsertClient] Envoi vers /api/ed/compte/upsert', {
      id: account?.id ?? account?.idCompte ?? account?.compteId,
      email: account?.email ?? account?.mail,
      type: account?.typeCompte ?? account?.type,
    });

    const res = await fetch('/api/ed/compte/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account }),
    });

    const payload = await res.json().catch(() => ({}));
    console.log('[UpsertClient] Résultat upsert', {
      httpStatus: res.status,
      okFlag: payload?.ok,
      statusField: payload?.status,
      hasData: !!payload?.data,
      error: payload?.error,
    });

    if (!res.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Upsert HTTP ${res.status}`);
    }
  } catch (err: any) {
    console.error('[UpsertClient] ERREUR upsert', err?.message || err);
  }
}
