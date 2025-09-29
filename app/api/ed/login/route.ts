// app/api/ed/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ED_BASE, ED_VERSION, normalizeGtk, headersWithGtk, makeDataBody } from '../_shared';

export const runtime = 'nodejs';

/**
 * Body JSON attendu:
 * {
 *   "username": string,
 *   "password": string,
 *   "gtk": string,
 *   "cookieHeader"?: string,
 *   "fa"?: Array<{ cn: string, cv: string }> // pour relogin après QCM
 * }
 */
export async function POST(req: NextRequest) {
  const { username, password, gtk: rawGtk, cookieHeader, fa } = await req.json();
  const gtk = normalizeGtk(rawGtk);

  if (!username || !password || !gtk) {
    return NextResponse.json(
      { ok: false, status: 400, message: 'username, password et gtk sont requis' },
      { status: 400 },
    );
  }

  const url = `${ED_BASE}/v3/login.awp?v=${ED_VERSION}`;

  const payload: any = {
    identifiant: String(username),
    motdepasse: String(password),
    isRelogin: false,
    uuid: '',
  };

  // Si on relance un login après QCM, on ajoute fa
  if (Array.isArray(fa) && fa.length > 0) {
    payload.fa = fa;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: headersWithGtk(gtk, cookieHeader),
    body: makeDataBody(payload),
  });

  const xToken = res.headers.get('x-token') ?? undefined;
  const xCode = res.headers.get('x-code') ?? undefined;
  const data = await res.json().catch(() => ({} as any));
  const token = (data && (data.token || data.data?.token)) ?? xToken;

  return NextResponse.json(
    {
      ok: res.ok,
      status: res.status,
      codeHeader: xCode,
      code: data?.code,
      message: data?.message,
      token,
      data,
    },
    { status: res.ok ? 200 : res.status },
  );
}
