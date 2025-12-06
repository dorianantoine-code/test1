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
    'Content-Type': 'application/x-www-form-urlencoded',
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

function sanitizeCookieValue(val: string) {
  // Retire retours chariot/espaces qui cassent un header Cookie
  return val.replace(/\s+/g, '');
}

// Construit un jar minimal "name=value; name2=value2" à partir d'un Set-Cookie brut
export function cookieJarFromSetCookieRaw(setCookieRaw: string | null): string {
  if (!setCookieRaw) return '';
  const pairs = setCookieRaw
    .split(/,(?=[^;]+=[^;]+)/g) // split sur virgules qui séparent les cookies (en évitant celles des dates d'expires)
    .map((c) => c.trim().split(';')[0])
    .filter(Boolean);
  const sanitized = pairs
    .map((p) => {
      const eq = p.indexOf('=');
      if (eq <= 0) return null;
      const key = p.slice(0, eq).trim();
      const val = sanitizeCookieValue(p.slice(eq + 1));
      if (!key || !val) return null;
      return `${key}=${val}`;
    })
    .filter(Boolean) as string[];
  return sanitized.join('; ');
}

// Fusionne plusieurs jar "name=value; name2=value2" en conservant les valeurs non vides
export function mergeCookieHeaders(...headers: Array<string | null | undefined>): string {
  const store = new Map<string, string>();

  for (const header of headers) {
    if (!header) continue;
    const parts = header.split(';').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      const key = part.slice(0, eq).trim();
      const val = sanitizeCookieValue(part.slice(eq + 1));
      if (val === '' && store.has(key)) continue; // ne pas écraser une valeur par vide
      store.set(key, val);
    }
  }

  return Array.from(store.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// Pré-login léger: tente d'obtenir un GTK + un "cookie jar" simplifié depuis /login.awp?gtk=1
export async function prelogin() {
  const url = `${ED_BASE}/v3/login.awp?gtk=1&v=${ED_VERSION}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA },
  });

  const setCookieRaw = res.headers.get('set-cookie'); // peut contenir plusieurs cookies concaténés
  const gtk = extractGtkFromSetCookieRaw(setCookieRaw);
  const cookieHeader = cookieJarFromSetCookieRaw(setCookieRaw);

  return { gtk, cookieHeader, status: res.status, setCookieRaw };
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
    gtk?: string;
  },
) {
  const { token, verbe, query = {}, data = {}, cookieHeader, gtk } = opts;
  const url = new URL(`${ED_BASE}${path}`);
  url.searchParams.set('verbe', verbe);
  url.searchParams.set('v', ED_VERSION);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));

  const headers = headersWithToken(token, cookieHeader);
  if (gtk) headers['X-Gtk'] = gtk;

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: makeDataBody(data),
  });

  // ED renvoie toujours JSON
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
