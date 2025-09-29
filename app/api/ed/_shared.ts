// app/api/ed/_shared.ts

// Base/api/UA alignés sur la requête qui marche (ta capture)
export const ED_BASE = 'https://api.ecoledirecte.com';
export const ED_VERSION = '4.69.1';
export const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36';

// Supprime CR/LF/espaces qui apparaissent parfois dans les valeurs GTK copiées depuis les outils réseau
export function normalizeGtk(raw: string | null | undefined) {
  return (raw ?? '').toString().replace(/\s+/g, '');
}

// En-têtes "de base" qu'on réutilise partout (UA/Origin/Referer/CT…)
export function baseHeaders() {
  return {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'fr-FR,fr;q=0.5',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/plain;charset=UTF-8',
    Origin: 'https://www.ecoledirecte.com',
    Referer: 'https://www.ecoledirecte.com/',
    Pragma: 'no-cache',
  } as const;
}

// Login: X-Gtk obligatoire + Cookie: GTK=... ; on peut concaténer un jar reçu avant
export function headersWithGtk(gtk: string, cookieHeader?: string) {
  const h: Record<string, string> = { ...baseHeaders(), 'X-Gtk': gtk };
  const cookiePieces: string[] = [];
  if (gtk) cookiePieces.push(`GTK=${gtk}`);
  if (cookieHeader) cookiePieces.push(cookieHeader);
  if (cookiePieces.length) h['Cookie'] = cookiePieces.join('; ');
  return h;
}

// Appels authentifiés: X-Token obligatoire ; on peut réinjecter le jar si utile
export function headersWithToken(token: string, cookieHeader?: string) {
  const h: Record<string, string> = { ...baseHeaders(), 'X-Token': token };
  if (cookieHeader) h['Cookie'] = cookieHeader;
  return h;
}

// Corps attendu par ED: toujours POST HTTP, data=<JSON-encodé> en text/plain
export function makeDataBody(payload: any) {
  return `data=${encodeURIComponent(JSON.stringify(payload ?? {}))}`;
}

// Extraction "best effort" du GTK à partir d'un header Set-Cookie combiné
export function extractGtkFromSetCookieRaw(setCookieRaw: string | null): string | null {
  if (!setCookieRaw) return null;
  const m = setCookieRaw.match(/(?:^|[,;]\s*)GTK=([^;,\s]+)/i);
  return m?.[1] ? normalizeGtk(m[1]) : null;
}

// Appel générique vers ED (toutes routes hors /login.awp)
// - verbe "get" | "post" passé en query (?verbe=...)
// - toujours POST HTTP, header X-Token
export async function edCall(
  path: string,
  opts: {
    token: string;
    verbe: 'get' | 'post';
    query?: Record<string, string | number>;
    data?: any;
    cookieHeader?: string;
  },
) {
  const { token, verbe, query = {}, data = {}, cookieHeader } = opts;
  const url = new URL(`${ED_BASE}${path}`);
  url.searchParams.set('verbe', verbe);
  url.searchParams.set('v', ED_VERSION);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: headersWithToken(token, cookieHeader),
    body: makeDataBody(data),
  });

  // ED renvoie toujours JSON
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
