import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ certificateId: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
    if (role !== 'student') return NextResponse.json({ error: 'Certificate previews are available to the certificate holder.' }, { status: 403 });
    const { certificateId } = await params;
    const { data, error } = await auth.supabase
      .from('certificates')
      .select('id,certificate_code,certificate_type,certificate_status,recipient_name,project_title,project_description,pathway_name,skills,issuer_name,signatory_name,signatory_title,issued_at,revoked_at,revocation_reason')
      .eq('id', certificateId)
      .eq('student_user_id', auth.user.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Certificate could not be loaded: ${error.message}` }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'Certificate not found for this account.' }, { status: 404 });
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Certificate could not be loaded.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
    if (role !== 'admin') return NextResponse.json({ error: 'Only the platform administrator can revoke a certificate.' }, { status: 403 });
    const { certificateId } = await params;
    const body = await req.json() as { action?: string; reason?: string };
    if (body.action !== 'revoke') return NextResponse.json({ error: 'Unsupported certificate action.' }, { status: 400 });
    const reason = String(body.reason || '').trim();
    if (reason.length > 500) return NextResponse.json({ error: 'The revocation reason must be 500 characters or fewer.' }, { status: 400 });
    const { data, error } = await auth.supabase
      .from('certificates')
      .update({
        certificate_status: 'revoked',
        revoked_at: new Date().toISOString(),
        revocation_reason: reason || null,
      })
      .eq('id', certificateId)
      .eq('certificate_status', 'issued')
      .select('id,certificate_code,certificate_status,revoked_at,revocation_reason')
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Certificate could not be revoked: ${error.message}` }, { status: 400 });
    if (!data) return NextResponse.json({ error: 'The certificate was not found or is already revoked.' }, { status: 409 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Certificate could not be revoked.' }, { status: 500 });
  }
}
