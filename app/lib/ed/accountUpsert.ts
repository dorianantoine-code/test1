import { getSupabaseAdmin } from '../supabaseAdmin';

/**
 * Pour les logs: on masque `raw` (payload ED complet) pour éviter les logs volumineux.
 */
function summarizeAccountForLog(account: any) {
  try {
    const keys = Object.keys(account ?? {});
    const id = account?.id ?? account?.idCompte ?? account?.compteId;
    const email = account?.email ?? account?.mail;
    const type = account?.typeCompte ?? account?.type;
    const etab = account?.etablissement?.nom ?? account?.etablissement;
    return { id, email, type, etab, keysCount: keys.length };
  } catch {
    return { invalid: true };
  }
}

type Nullable<T> = T | null;

export type CompteRow = {
  ed_account_id: string;
  id_login: Nullable<string>;
  email: Nullable<string>;
  prenom: Nullable<string>;
  nom: Nullable<string>;
  type_compte: Nullable<string>;
  code_ogec: Nullable<string>;
  etablissement: Nullable<string>;
  last_login_at?: string;
  raw: any;
};

export function mapEdAccountToRow(account: any): CompteRow {
  const idRaw = account?.id ?? account?.idCompte ?? account?.compteId;

  const idLoginRaw = account?.idLogin ?? account?.loginId ?? null;

  const email = account?.email ?? account?.mail ?? null;
  const prenom = account?.prenom ?? account?.firstName ?? null;
  const nom = account?.nom ?? account?.lastName ?? null;
  const typeCompte = account?.typeCompte ?? account?.type ?? null;

  const codeOgec =
    account?.codeOgec ?? account?.etablissement?.codeOgec ?? account?.profile?.codeOgec ?? null;

  const etab =
    account?.etablissement?.nom ??
    account?.profile?.nomEtablissement ??
    account?.etablissement ??
    null;

  if (idRaw == null) {
    console.error(
      '[UpsertCompte] mapEdAccountToRow: id manquant dans account',
      summarizeAccountForLog(account),
    );
    throw new Error('mapEdAccountToRow: id manquant dans account');
  }

  const mapped: CompteRow = {
    ed_account_id: String(idRaw), // en string -> Postgres BIGINT
    id_login: idLoginRaw != null ? String(idLoginRaw) : null,
    email,
    prenom,
    nom,
    type_compte: typeCompte,
    code_ogec: codeOgec,
    etablissement: etab,
    last_login_at: new Date().toISOString(),
    raw: account,
  };

  console.log('[UpsertCompte] Mapped account → row', {
    ed_account_id: mapped.ed_account_id,
    id_login: mapped.id_login,
    email: mapped.email,
    prenom: mapped.prenom,
    nom: mapped.nom,
    type_compte: mapped.type_compte,
    code_ogec: mapped.code_ogec,
    etablissement: mapped.etablissement,
    hasRaw: !!mapped.raw,
  });

  return mapped;
}

export async function upsertCompteFromAccount(account: any) {
  console.log('[UpsertCompte] Début upsert à partir de `account`', summarizeAccountForLog(account));

  const row = mapEdAccountToRow(account);
  const supabase = getSupabaseAdmin();

  console.log('[UpsertCompte] Appel Supabase.upsert()', {
    table: 'compte',
    pk: row.ed_account_id,
  });

  const { data, error } = await supabase
    .from('compte')
    .upsert(
      {
        ed_account_id: row.ed_account_id,
        id_login: row.id_login,
        email: row.email,
        prenom: row.prenom,
        nom: row.nom,
        type_compte: row.type_compte,
        code_ogec: row.code_ogec,
        etablissement: row.etablissement,
        last_login_at: row.last_login_at,
        raw: row.raw,
      },
      { onConflict: 'ed_account_id', ignoreDuplicates: false },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error('[UpsertCompte] Supabase error', {
      message: error.message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    });
    throw error;
  }

  console.log('[UpsertCompte] Upsert OK', {
    returnedNull: data == null,
    returnedKeys: data ? Object.keys(data) : [],
  });

  return data;
}
