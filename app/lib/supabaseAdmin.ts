import { createClient } from '@supabase/supabase-js';

/**
 * Client admin Supabase (SERVICE ROLE).
 * ⚠️ Ne jamais l'utiliser côté client.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Logs de diagnostic (sans exposer les secrets)
  console.log('[SupabaseAdmin] init', {
    hasUrl: !!url,
    hasServiceRole: !!serviceKey,
  });

  if (!url) {
    console.error('[SupabaseAdmin] NEXT_PUBLIC_SUPABASE_URL manquant');
    throw new Error('NEXT_PUBLIC_SUPABASE_URL manquant');
  }
  if (!serviceKey) {
    console.error('[SupabaseAdmin] SUPABASE_SERVICE_ROLE_KEY manquant');
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquant');
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  console.log('[SupabaseAdmin] client créé OK');
  return client;
}
