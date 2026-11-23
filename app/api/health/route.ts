import { NextResponse } from 'next/server';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

export async function GET() {
  const configuration = getSupabaseConfiguration();
  let supabaseStatus = configuration.error || 'not_checked';
  let supabaseHttpStatus: number | null = null;
  let supabaseReachable: boolean | null = null;
  if (!configuration.error) {
    try {
      const response = await fetch(`${configuration.url}/auth/v1/settings`, {
        headers: { apikey: configuration.key },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      supabaseHttpStatus = response.status;
      supabaseReachable = response.ok;
      supabaseStatus = response.ok
        ? 'ready'
        : response.status === 401 || response.status === 403
          ? 'invalid_api_key'
          : response.status === 404
            ? 'invalid_project_url'
            : response.status >= 500
            ? 'project_unavailable'
            : 'supabase_rejected_request';
    } catch {
      supabaseReachable = false;
      supabaseStatus = 'network_connectivity_failure';
    }
  }
  async function providerCheck(url: string, init?: RequestInit) {
    try {
      const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) });
      return { reachable: response.ok, httpStatus: response.status };
    } catch {
      return { reachable: false, httpStatus: null };
    }
  }
  const [geminiCheck, youtubeCheck, githubCheck, resendCheck] = await Promise.all([
    process.env.GEMINI_API_KEY
      ? providerCheck(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`)
      : Promise.resolve({ reachable: false, httpStatus: null }),
    process.env.YOUTUBE_API_KEY
      ? providerCheck(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`)
      : Promise.resolve({ reachable: false, httpStatus: null }),
    process.env.GITHUB_TOKEN
      ? providerCheck('https://api.github.com/rate_limit', { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } })
      : Promise.resolve({ reachable: true, httpStatus: null }),
    process.env.RESEND_API_KEY
      ? providerCheck('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
      : Promise.resolve({ reachable: false, httpStatus: null }),
  ]);
  const result: {
    app: string;
    supabaseConfigured: boolean;
    supabaseReachable: boolean | null;
    supabaseHttpStatus: number | null;
    supabaseStatus: string;
    geminiConfigured: boolean;
    youtubeConfigured: boolean;
    resendConfigured: boolean;
    githubTokenConfigured: boolean;
    geminiReachable: boolean;
    youtubeReachable: boolean;
    githubReachable: boolean;
    resendReachable: boolean;
    emailFromConfigured: boolean;
    appBaseUrlConfigured: boolean;
    customDomainRestriction: boolean;
    geminiHttpStatus: number | null;
    youtubeHttpStatus: number | null;
    githubHttpStatus: number | null;
    resendHttpStatus: number | null;
  } = {
    app: 'BuildBridge',
    supabaseConfigured: !configuration.error,
    supabaseReachable,
    supabaseHttpStatus,
    supabaseStatus,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    geminiReachable: geminiCheck.reachable,
    youtubeReachable: youtubeCheck.reachable,
    githubReachable: githubCheck.reachable,
    resendReachable: resendCheck.reachable,
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    appBaseUrlConfigured: Boolean(process.env.APP_BASE_URL),
    customDomainRestriction: true,
    geminiHttpStatus: geminiCheck.httpStatus,
    youtubeHttpStatus: youtubeCheck.httpStatus,
    githubHttpStatus: githubCheck.httpStatus,
    resendHttpStatus: resendCheck.httpStatus,
  };
  return NextResponse.json(result, {
    status: supabaseStatus === 'ready' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
