import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

export async function createClient() {
  const configuration = getSupabaseConfiguration();
  if (configuration.error) return null;

  const cookieStore = await cookies();
  const sessionOnly = cookieStore.get('buildbridge-remember')?.value === 'session';
  return createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const safeOptions = { ...options };
            if (sessionOnly && value) {
              delete safeOptions.maxAge;
              delete safeOptions.expires;
            }
            cookieStore.set(name, value, safeOptions);
          });
        } catch {
          // Server components cannot mutate cookies; middleware refreshes them.
        }
      },
    },
  });
}
