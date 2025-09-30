import { NextResponse } from 'next/server';
import { upsertCompteFromAccount } from '../../../../lib/ed/accountUpsert';

/**
 * Endpoint Option 2 : reçoit { account } et fait l'upsert côté serveur.
 * Réponses normalisées: { ok: boolean, status: number, data?: any, error?: string }
 */
export async function POST(req: Request) {
  console.log('[API] /api/ed/compte/upsert → POST');
  try {
    const body = await req.json().catch(() => ({}));
    const account = body?.account;

    console.log('[API] Payload reçu', {
      hasAccount: !!account,
      accountKeys: account ? Object.keys(account) : [],
    });

    if (!account || typeof account !== 'object') {
      const resp = { ok: false, status: 400, error: 'payload { account } requis' };
      console.warn('[API] 400', resp);
      return NextResponse.json(resp, { status: 400 });
    }

    const data = await upsertCompteFromAccount(account);

    const resp = { ok: true, status: 200, data };
    console.log('[API] 200 upsert OK');
    return NextResponse.json(resp, { status: 200 });
  } catch (e: any) {
    const message = e?.message || 'Erreur serveur';
    const resp = { ok: false, status: 500, error: message };
    console.error('[API] 500', message);
    return NextResponse.json(resp, { status: 500 });
  }
}
