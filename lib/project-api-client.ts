import { createClient } from '@/lib/supabase';

type ProjectApiOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
};

export async function projectApi<T>(path: string, options: ProjectApiOptions = {}): Promise<T> {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured for this application.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(`Your sign-in session could not be checked: ${sessionError.message}`);
  if (!session?.access_token) throw new Error('Sign in to use the project marketplace.');

  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });
  const result = await response.json() as { data?: T; error?: string };
  if (!response.ok) throw new Error(result.error || `Project request failed with status ${response.status}.`);
  if (!Object.prototype.hasOwnProperty.call(result, 'data')) throw new Error('The project service returned an invalid response.');
  return result.data as T;
}
