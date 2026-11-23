export type SupabaseConfigurationError = 'missing_url' | 'missing_key' | 'invalid_url' | 'placeholder_configuration';

export type SupabaseConfiguration =
  | { url: string; key: string; error: null }
  | { url: string | null; key: string | null; error: SupabaseConfigurationError };

function isPlaceholder(value: string) {
  return /your[_ -]|placeholder|replace[_ -]?me|example\.com/i.test(value);
}

export function getSupabaseConfiguration(): SupabaseConfiguration {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();

  if (!url) return { url: null, key: key || null, error: 'missing_url' };
  if (isPlaceholder(url) || (key && isPlaceholder(key))) return { url: null, key: null, error: 'placeholder_configuration' };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { url: null, key: null, error: 'invalid_url' };
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    return { url: null, key: null, error: 'invalid_url' };
  }
  if (!key) return { url, key: null, error: 'missing_key' };
  return { url: url.replace(/\/$/, ''), key, error: null };
}

export function supabaseConfigurationMessage(error: SupabaseConfigurationError) {
  switch (error) {
    case 'missing_url':
      return 'Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL is missing.';
    case 'missing_key':
      return 'Supabase is not configured: add NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.';
    case 'invalid_url':
      return 'Supabase configuration is invalid: NEXT_PUBLIC_SUPABASE_URL must be a valid http(s) project URL.';
    case 'placeholder_configuration':
      return 'Supabase configuration still contains example values. Replace them with your project URL and public key.';
  }
}