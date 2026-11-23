import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribeToken } from '@/lib/email-unsubscribe';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    const claim = verifyUnsubscribeToken(token);
    if (!claim) return NextResponse.json({ error: 'This unsubscribe link is invalid or expired.' }, { status: 400 });
    const confirmUrl = new URL('/auth/email-unsubscribed', request.url);
    confirmUrl.searchParams.set('token', token);
    const response = NextResponse.redirect(confirmUrl);
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unsubscribe could not be completed.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string };
    const claim = verifyUnsubscribeToken(body.token || '');
    if (!claim) return NextResponse.json({ error: 'This unsubscribe link is invalid or expired.' }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Email preference service is not configured.' }, { status: 503 });
    const { error } = await admin.from('notification_preferences').upsert({
      user_id: claim.userId, email_enabled: false, updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: `Email preferences could not be updated: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unsubscribe could not be completed.' }, { status: 500 });
  }
}
