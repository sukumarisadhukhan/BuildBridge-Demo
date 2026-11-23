import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

export function createAdminClient() {
  const configuration = getSupabaseConfiguration();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configuration.error || !key || /^your[_ -]|placeholder|replace[_ -]?me/i.test(key)) return null;
  return createClient(configuration.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
