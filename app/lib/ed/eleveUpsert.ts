// Server-side helpers pour upsert élève
import { getSupabaseAdmin } from '../supabaseAdmin';

type Nullable<T> = T | null;

export type EleveRow = {
  ed_eleve_id: string; // envoyés en STRING -> Postgres BIGINT
  ed_account_id: string;
  prenom: Nullable<string>;
  nom: Nullable<string>;
  classe: Nullable<string>;
  code_ogec: Nullable<string>;
  etablissement: Nullable<string>;
  photo_url: Nullable<string>;
  last_seen_at?: string;
  raw: any;
};

function val(...args: any[]) {
  for (const a of args) if (a !== undefined && a !== null && a !== '') return a;
  return null;
}

export function mapEleveToRow(eleve: any, edAccountId?: string): EleveRow {
  const idEleve = val(eleve?.id, eleve?.ideleve, eleve?.idEleve, eleve?.eleveId) ?? undefined;
  if (!idEleve) {
    console.error('[EleveUpsert] id élève manquant dans payload', Object.keys(eleve ?? {}));
    throw new Error('mapEleveToRow: id élève manquant');
  }

  const classe = val(
    eleve?.classe?.libelle,
    eleve?.classe?.libelleCourt,
    eleve?.classe?.code,
    eleve?.classe,
  );

  const codeOgec = val(
    eleve?.etablissement?.codeOgec,
    eleve?.établissement?.codeOgec,
    eleve?.codeOgec,
  );

  const etab = val(
    eleve?.etablissement?.nom,
    eleve?.établissement?.nom,
    eleve?.etablissement,
    eleve?.nomEtablissement,
  );

  const photoUrl = val(eleve?.photo, eleve?.photoUrl, eleve?.photo_url, eleve?.avatar);

  const row: EleveRow = {
    ed_eleve_id: String(idEleve),
    ed_account_id: String(edAccountId ?? eleve?.ed_account_id ?? eleve?.accountId ?? ''),
    prenom: val(eleve?.prenom, eleve?.firstName),
    nom: val(eleve?.nom, eleve?.lastName),
    classe: classe,
    code_ogec: codeOgec,
    etablissement: etab,
    photo_url: photoUrl,
    last_seen_at: new Date().toISOString(),
    raw: eleve,
  };

  if (!row.ed_account_id) {
    console.warn('[EleveUpsert] ed_account_id non fourni — recommande de le passer explicitement.');
  }

  console.log('[EleveUpsert] mapped', {
    ed_eleve_id: row.ed_eleve_id,
    ed_account_id: row.ed_account_id,
    prenom: row.prenom,
    nom: row.nom,
    classe: row.classe,
    code_ogec: row.code_ogec,
    etablissement: row.etablissement,
    hasPhoto: !!row.photo_url,
  });

  return row;
}

export async function upsertEleve(row: EleveRow) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('eleve')
    .upsert(
      {
        ed_eleve_id: row.ed_eleve_id,
        ed_account_id: row.ed_account_id,
        prenom: row.prenom,
        nom: row.nom,
        classe: row.classe,
        code_ogec: row.code_ogec,
        etablissement: row.etablissement,
        photo_url: row.photo_url,
        last_seen_at: row.last_seen_at,
        raw: row.raw,
      },
      { onConflict: 'ed_eleve_id', ignoreDuplicates: false },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error('[EleveUpsert] Supabase error', error);
    throw error;
  }

  console.log('[EleveUpsert] upsert OK', { hasData: !!data });
  return data;
}

export async function upsertEleveFromPayload(eleve: any, edAccountId?: string) {
  const row = mapEleveToRow(eleve, edAccountId);
  return upsertEleve(row);
}
