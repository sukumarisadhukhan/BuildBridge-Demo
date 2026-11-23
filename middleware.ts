import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

export async function middleware(request: NextRequest) {
  const configuration = getSupabaseConfiguration();
  if (configuration.error) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const sessionOnly = request.cookies.get('buildbridge-remember')?.value === 'session';
  const supabase = createServerClient(configuration.url, configuration.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, cacheHeaders) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          const safeOptions = { ...options };
          if (sessionOnly && value) {
            delete safeOptions.maxAge;
            delete safeOptions.expires;
          }
          response.cookies.set(name, value, safeOptions);
        });
        Object.entries(cacheHeaders || {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    const signIn = new URL('/auth/sign-in', request.url);
    signIn.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ['/workspace/:path*', '/projects/:path*'],
};
