import { NextResponse } from 'next/server';
import axios from 'axios';
import { ED_BASE, ED_VERSION, baseHeaders, prelogin, toForm } from '../_shared';

export const runtime = 'nodejs';

export async function GET() {
  const { gtk } = await prelogin();
  if (!gtk) return NextResponse.json({ error: 'GTK introuvable' }, { status: 502 });

  // on envoie volontairement de mauvais identifiants pour juste vérifier le code retour
  const url = `${ED_BASE}/v3/login.awp?v=${ED_VERSION}`;
  const payload = { identifiant: '___', motdepasse: '___', isReLogin: false, uuid: '' };

  const res = await axios.post(url, toForm(payload), {
    headers: { ...baseHeaders(gtk), 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
    proxy: false,
  });

  const code = res.data?.code;
  // 250 attendu si le tenant demande 2FA pour cet essai (parfois 505/250 selon tenant)
  return NextResponse.json({
    httpStatus: res.status,
    code,
    hasTokenHeader: !!res.headers['x-token'],
  });
}
