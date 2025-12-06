import { NextResponse } from 'next/server';
import { ED_BASE, ED_VERSION, headersWithGtk, makeDataBody, prelogin } from '../_shared';

export const runtime = 'nodejs';

export async function GET() {
  const { gtk, cookieHeader } = await prelogin();
  if (!gtk) return NextResponse.json({ error: 'GTK introuvable' }, { status: 502 });

  // on envoie volontairement de mauvais identifiants pour juste vérifier le code retour
  const url = `${ED_BASE}/v3/login.awp?v=${ED_VERSION}`;
  const payload = { identifiant: '___', motdepasse: '___', isReLogin: false, uuid: '' };

  const res = await fetch(url, {
    method: 'POST',
    headers: headersWithGtk(gtk, cookieHeader),
    body: makeDataBody(payload),
  });

  const data = await res.json().catch(() => ({} as any));
  const code = data?.code;
  // 250 attendu si le tenant demande 2FA pour cet essai (parfois 505/250 selon tenant)
  return NextResponse.json({
    httpStatus: res.status ?? 0,
    code,
    hasTokenHeader: !!res.headers.get('x-token'),
  });
}
