import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

let browserClient: SupabaseClient | null = null;
let browserClientRememberMode: boolean | null = null;
const REMEMBER_COOKIE = 'buildbridge-remember';
const LONG_SESSION_SECONDS = 60 * 60 * 24 * 400;

type CookieOptions = {
  path?: string;
  domain?: string;
  sameSite?: 'strict' | 'lax' | 'none' | boolean;
  secure?: boolean;
  maxAge?: number;
  expires?: Date | string;
};

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const part = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return part ? part.slice(prefix.length) : null;
}

function writeCookie(name: string, value: string, options: CookieOptions = {}, rememberMe = true) {
  if (typeof document === 'undefined') return;
  const attributes = [`Path=${options.path || '/'}`, `SameSite=${options.sameSite === 'strict' ? 'Strict' : options.sameSite === 'none' ? 'None' : 'Lax'}`];
  if (options.domain) attributes.push(`Domain=${options.domain}`);
  if (options.secure || window.location.protocol === 'https:') attributes.push('Secure');

  const deleting = !value || options.maxAge === 0;
  if (deleting) {
    attributes.push('Max-Age=0');
    attributes.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  } else if (rememberMe) {
    const requestedAge = typeof options.maxAge === 'number' && options.maxAge > 0 ? options.maxAge : LONG_SESSION_SECONDS;
    attributes.push(`Max-Age=${Math.min(requestedAge, LONG_SESSION_SECONDS)}`);
  }
  // When Remember me is off, omit both Max-Age and Expires so the browser
  // keeps the session cookie only for the current browser session.
  document.cookie = `${name}=${value}; ${attributes.join('; ')}`;
}

export function setRememberPreference(rememberMe: boolean) {
  writeCookie(REMEMBER_COOKIE, rememberMe ? 'persistent' : 'session', { path: '/', sameSite: 'lax' }, rememberMe);
  browserClient = null;
  browserClientRememberMode = null;
}

export function clearRememberPreference() {
  writeCookie(REMEMBER_COOKIE, '', { path: '/', sameSite: 'lax', maxAge: 0 }, false);
  browserClient = null;
  browserClientRememberMode = null;
}

function readRememberPreference() {
  return readCookie(REMEMBER_COOKIE) !== 'session';
}

function getBrowserCookies() {
  if (typeof document === 'undefined') return [];
  return document.cookie.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const separator = part.indexOf('=');
    return separator < 0
      ? { name: part, value: '' }
      : { name: part.slice(0, separator), value: part.slice(separator + 1) };
  });
}

/**
 * Browser sessions stay compatible with Supabase SSR cookies. The explicit
 * cookie writer makes the sign-in "Remember me" control meaningful without
 * moving tokens into localStorage or bypassing server-side session checks.
 */
export function createClient(options?: { rememberMe?: boolean }): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  const configuration = getSupabaseConfiguration();
  if (configuration.error) return null;

  const rememberMe = options?.rememberMe ?? readRememberPreference();
  if (!browserClient || browserClientRememberMode !== rememberMe) {
    browserClient = createBrowserClient(configuration.url, configuration.key, {
      isSingleton: false,
      cookies: {
        getAll: getBrowserCookies,
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options: cookieOptions }) => {
            writeCookie(name, value, cookieOptions as CookieOptions, rememberMe);
          });
        },
      },
    });
    browserClientRememberMode = rememberMe;
  }
  return browserClient;
}
