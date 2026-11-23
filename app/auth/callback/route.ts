import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeInternalNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/workspace';
  try {
    const parsed = new URL(value, 'https://buildbridge.invalid');
    if (parsed.origin !== 'https://buildbridge.invalid') return '/workspace';
    parsed.searchParams.delete('accountType');
    const screen = parsed.searchParams.get('screen');
    const allowedScreens = new Set(['Dashboard', 'Profile', 'Learn', 'My Path', 'Projects', 'My Projects', 'My Learning & Work Vault', 'Opportunities', 'Achievements', 'AI Mentor', 'Settings']);
    if (screen && !allowedScreens.has(screen)) parsed.searchParams.delete('screen');
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/workspace';
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const providerError = request.nextUrl.searchParams.get('error_description') || request.nextUrl.searchParams.get('error');
  const next = safeInternalNext(request.nextUrl.searchParams.get('next'));
  const supabase = await createClient();
  const signInWithError = (message: string) => {
    const signIn = new URL('/auth/sign-in', request.url);
    signIn.searchParams.set('error', message.slice(0, 300));
    signIn.searchParams.set('next', next);
    return NextResponse.redirect(signIn);
  };
  if (!supabase) return signInWithError('Supabase authentication is not configured.');
  if (providerError) {
    const message = /provider.*(not enabled|not configured)|unsupported provider/i.test(providerError)
      ? 'This identity provider is not enabled in Supabase.'
      : providerError;
    return signInWithError(message);
  }
  let destination = next;
  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        const recovered = await supabase.auth.getUser();
        if (!recovered.data.user) return signInWithError(error.message);
      }
    }
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return signInWithError(error.message);
    if (!user) return signInWithError(code ? 'The Supabase session could not be restored.' : 'The identity provider callback did not include an authentication code.');
    if (next === '/workspace') {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profile?.role === 'student') destination = '/student/dashboard';
      else if (profile?.role === 'company_member') destination = '/company/dashboard';
      else if (profile?.role === 'admin') destination = '/admin';
    }
  } catch {
    return signInWithError('Could not complete the Supabase session exchange. Check your network and try signing in again.');
  }
  return NextResponse.redirect(new URL(destination, request.url));
}
