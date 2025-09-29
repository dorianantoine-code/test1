// app/api/ed/gtk/route.ts
import { NextResponse } from 'next/server';
import { ED_BASE, ED_VERSION, UA, extractGtkFromSetCookieRaw } from '../_shared';

export const runtime = 'nodejs';

/**
 * Pré-login "léger" :
 * - Tente d'obtenir un jar Set-Cookie côté serveur en appelant /v3/login.awp?gtk=1&v=...
 * - Essaie d'extraire GTK depuis Set-Cookie (selon comportements serveurs, parfois absent)
 * - Renvoie ce qu'on a (gtk potentiellement null) + jar brut
 *
 * NB: Si tu as un autre flux fiable pour obtenir GTK côté client, garde-le.
 */
export async function GET() {
  const url = `${ED_BASE}/v3/login.awp?gtk=1&v=${ED_VERSION}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': UA },
    // Pas besoin d'autres headers ici
  });

  // Sur Node/Next, plusieurs Set-Cookie peuvent être "aplatis" dans un seul header
  const setCookieRaw = res.headers.get('set-cookie'); // peut contenir plusieurs cookies concaténés
  const gtk = extractGtkFromSetCookieRaw(setCookieRaw);

  // On retourne aussi le "jar" minimal (name=value; name2=value2 …) si présent
  let cookieHeader = '';
  if (setCookieRaw) {
    // On ne garde que "name=value" pour chacun ; c'est un "best effort"
    // Exemple: "foo=bar; Path=/; HttpOnly, baz=qux; Path=/"
    const pairs = setCookieRaw
      .split(/,(?=[^;]+=[^;]+)/g) // split sur virgules qui séparent les cookies (en évitant celles des dates d'expires)
      .map((c) => c.trim().split(';')[0])
      .filter(Boolean);
    cookieHeader = pairs.join('; ');
  }

  return NextResponse.json(
    {
      ok: true,
      v: ED_VERSION,
      gtk, // peut être null
      cookieHeader, // jar simplifié, à réutiliser au login si utile
      status: res.status,
    },
    { status: 200 },
  );
}
