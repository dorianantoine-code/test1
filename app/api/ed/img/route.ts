// app/api/ed/img/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Autorise doc1, doc2, … .ecoledirecte.com
function isAllowedHost(host: string) {
  return /^doc\d+\.ecoledirecte\.com$/i.test(host);
}

/**
 * GET /api/ed/img?u=<URL absolue encodée>
 * Exemple: /api/ed/img?u=https%3A%2F%2Fdoc1.ecoledirecte.com%2FPhotoEleves%2F...jpg
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const u = searchParams.get('u');
  if (!u) return new NextResponse("Missing param 'u'", { status: 400 });

  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return new NextResponse('Unsupported protocol', { status: 400 });
  }
  if (!isAllowedHost(url.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(url.toString(), {
      // On mime un navigateur classique
      headers: {
        Accept: 'image/*,*/*;q=0.9',
        Referer: 'https://www.ecoledirecte.com/',
        // UA facultatif, mais utile si le serveur filtre
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
      },
      // Laisse le cache HTTP fonctionner côté CDN du serveur source
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse(`Upstream error ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    const res = new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache navigateur + hébergeur (ajuste si tu veux plus/moins agressif)
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'X-From-Proxy': '1',
      },
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Fetch failed' }, { status: 500 });
  }
}
