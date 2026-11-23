import { randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileRole } from '@/lib/api-auth';

export const runtime = 'nodejs';

const freeEmailDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'live.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com',
]);

async function getIdentity() {
  const supabase = await createClient();
  if (!supabase) return { error: 'Supabase is not configured.', status: 503 as const };
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: 'Authentication required.', status: 401 as const };
  const role = await getProfileRole(supabase, user.id, user.email);
  return { supabase, user, role };
}

export async function GET() {
  try {
    const identity = await getIdentity();
    if ('error' in identity) return NextResponse.json({ error: identity.error }, { status: identity.status });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Company domain verification is not configured. Add SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });

    if (identity.role === 'admin') {
      const { data, error } = await admin.from('company_domain_requests')
        .select(`
          id,user_id,email_domain,organization_name,official_website,organization_email,
          business_registration,country_of_registration,organization_type,description,
          authorized_representative_name,authorized_representative_title,authorized_representative_phone,
          status,email_verified_at,dns_verified_at,verification_attempts,verification_expires_at,
          previous_status,reviewed_by,reviewed_at,review_note,created_at,
          requester:profiles!company_domain_requests_user_id_fkey(email,full_name),
          reviewer:profiles!company_domain_requests_reviewed_by_fkey(email,full_name)
        `)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ error: `Domain requests could not be loaded: ${error.message}` }, { status: 400 });
      return NextResponse.json({ requests: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (identity.role === 'student' || identity.role === 'company_member') {
      const { data: existing, error: existingError } = await admin
        .from('company_domain_requests')
        .select('id,status')
        .eq('user_id', identity.user.id)
        .maybeSingle();
      if (existingError) return NextResponse.json({ error: `Company onboarding could not be checked: ${existingError.message}` }, { status: 400 });
      if (!existing) {
        const { data: intent, error: intentError } = await admin
          .from('company_domain_requests')
          .upsert({
            user_id: identity.user.id,
            email_domain: null,
            organization_name: null,
            dns_token: null,
            status: 'details_pending',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' })
          .select('id')
          .single();
        if (intentError) return NextResponse.json({ error: `Company onboarding intent could not be created: ${intentError.message}` }, { status: 400 });
        await admin.from('audit_logs').insert({
          actor_user_id: identity.user.id,
          action: 'company_registration_intent',
          entity_type: 'company_domain_request',
          entity_id: intent.id,
          details: { outcome: 'initiated', status: 'details_pending' },
        });
        await admin.rpc('notify_buildbridge_user', {
          target_user_id: identity.user.id,
          event_kind: 'project_update',
          event_title: 'Company registration started',
          event_body: 'Complete organization details and verification for administrator review.',
          event_payload: { status: 'details_pending' },
          event_dedupe_key: `company-registration-started:${intent.id}`,
        });
        const { data: owner } = await admin
          .from('platform_admin_owner')
          .select('owner_user_id')
          .eq('singleton', true)
          .maybeSingle();
        if (owner?.owner_user_id) {
          await admin.rpc('notify_buildbridge_user', {
            target_user_id: owner.owner_user_id,
            event_kind: 'project_update',
            event_title: 'New company registration intent',
            event_body: 'A company representative started organization verification.',
            event_payload: { request_id: intent.id, status: 'details_pending' },
            event_dedupe_key: `admin-company-registration:${intent.id}`,
          });
        }
      }
    }

    const { data, error } = await identity.supabase.from('company_domain_requests')
      .select('id,email_domain,organization_name,official_website,organization_email,business_registration,country_of_registration,organization_type,description,authorized_representative_name,authorized_representative_title,authorized_representative_phone,dns_token,status,email_verified_at,dns_verified_at,verification_attempts,verification_expires_at,previous_status,review_note,created_at')
      .eq('user_id', identity.user.id).maybeSingle();
    if (error) return NextResponse.json({ error: `Your company request could not be loaded: ${error.message}` }, { status: 400 });
    return NextResponse.json({ request: data || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Company access request failed.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if ('error' in identity) return NextResponse.json({ error: identity.error }, { status: identity.status });
    const body = await request.json() as {
      action?: string; domain?: string; organizationName?: string; organizationEmail?: string;
      officialWebsite?: string; businessRegistration?: string; countryOfRegistration?: string;
      organizationType?: string; description?: string; authorizedRepresentativeName?: string;
      authorizedRepresentativeTitle?: string; authorizedRepresentativePhone?: string;
      requestId?: string; decision?: string; note?: string;
    };
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: 'Company domain verification is not configured. Add SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });

    if (body.action === 'request') {
      if (identity.role !== 'student' && identity.role !== 'company_member') {
        return NextResponse.json({ error: 'Company registration is available only to student or company accounts.' }, { status: 403 });
      }
      if (!identity.user.email || !identity.user.email_confirmed_at) return NextResponse.json({ error: 'Confirm your email address before requesting company access.' }, { status: 403 });
      const domain = String(body.domain || '').trim().toLowerCase().replace(/^@/, '');
      const emailDomain = identity.user.email.split('@').pop()?.toLowerCase();
      const organizationName = String(body.organizationName || '').trim();
      if (!organizationName || organizationName.length > 160) return NextResponse.json({ error: 'Enter an organization name (up to 160 characters).' }, { status: 400 });
      const organizationEmail = String(body.organizationEmail || identity.user.email).trim().toLowerCase().slice(0, 320);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizationEmail) || organizationEmail !== identity.user.email.toLowerCase()) {
        return NextResponse.json({ error: 'Use a confirmed organization email address matching the signed-in account.' }, { status: 400 });
      }
      if (!domain || domain !== emailDomain || freeEmailDomains.has(domain) || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
        return NextResponse.json({ error: 'Use your confirmed organization email domain. Public email providers are not accepted.' }, { status: 400 });
      }
      let officialWebsite: string | null = null;
      if (!body.officialWebsite) {
        return NextResponse.json({ error: 'Enter the official organization website.' }, { status: 400 });
      } else {
        try {
          const website = new URL(String(body.officialWebsite));
          if (!['https:', 'http:'].includes(website.protocol) || website.username || website.password) throw new Error();
          officialWebsite = website.toString().slice(0, 500);
        } catch {
          return NextResponse.json({ error: 'Enter a valid official website URL.' }, { status: 400 });
        }
      }
      const organizationType = String(body.organizationType || '').trim();
      if (!organizationType || organizationType.length > 120) {
        return NextResponse.json({ error: 'Select the organization type.' }, { status: 400 });
      }
      const countryOfRegistration = String(body.countryOfRegistration || '').trim();
      if (!countryOfRegistration || countryOfRegistration.length > 120) {
        return NextResponse.json({ error: 'Enter the country of registration.' }, { status: 400 });
      }
      const authorizedName = String(body.authorizedRepresentativeName || '').trim();
      if (!authorizedName || authorizedName.length > 120) return NextResponse.json({ error: 'Enter the authorized representative name.' }, { status: 400 });

      const { data: existing, error: existingError } = await admin.from('company_domain_requests')
        .select('id,status,dns_token,email_domain,dns_verified_at').eq('user_id', identity.user.id).maybeSingle();
      if (existingError) return NextResponse.json({ error: `Existing request could not be checked: ${existingError.message}` }, { status: 400 });
      if (existing?.status === 'approved') return NextResponse.json({ error: 'Your company access has already been approved.' }, { status: 409 });
      const [{ data: duplicateDomain }, { data: duplicateName }] = await Promise.all([
        admin.from('company_domain_requests').select('id,user_id').eq('email_domain', domain).neq('user_id', identity.user.id).in('status', ['details_pending','submitted', 'email_pending', 'domain_pending', 'pending_dns', 'pending_admin', 'pending_admin_review', 'additional_information_required', 'approved']).limit(1),
        admin.from('company_domain_requests').select('id,user_id').ilike('organization_name', organizationName).neq('user_id', identity.user.id).limit(1),
      ]);
      if (duplicateDomain?.length) return NextResponse.json({ error: 'This organization domain already belongs to another company request.' }, { status: 409 });
      if (duplicateName?.length) return NextResponse.json({ error: 'This organization name is already associated with another company request.' }, { status: 409 });
      const domainUnchanged = existing?.email_domain === domain;
      const token = domainUnchanged ? existing.dns_token : randomUUID().replaceAll('-', '');
      const { data, error } = await admin.from('company_domain_requests').upsert({
        user_id: identity.user.id,
        email_domain: domain,
        organization_name: organizationName,
        dns_token: token,
        official_website: officialWebsite,
        organization_email: organizationEmail,
        business_registration: String(body.businessRegistration || '').trim().slice(0, 500) || null,
        country_of_registration: countryOfRegistration,
        organization_type: organizationType,
        description: String(body.description || '').trim().slice(0, 3000) || null,
        authorized_representative_name: authorizedName,
        authorized_representative_title: String(body.authorizedRepresentativeTitle || '').trim().slice(0, 120) || null,
        authorized_representative_phone: String(body.authorizedRepresentativePhone || '').trim().slice(0, 40) || null,
        email_verified_at: new Date().toISOString(),
        status: 'domain_pending',
        dns_verified_at: null,
        verification_attempts: 0,
        verification_expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).select('id,email_domain,organization_name,dns_token,status,dns_verified_at,review_note,created_at').single();
      if (error) return NextResponse.json({ error: `Company access request could not be saved: ${error.message}` }, { status: 400 });
      return NextResponse.json({ request: data }, { status: 201 });
    }

    if (body.action === 'verify_dns') {
      const { data: domainRequest, error } = await admin.from('company_domain_requests')
        .select('id,email_domain,dns_token,status,verification_attempts,verification_expires_at,email_verified_at').eq('user_id', identity.user.id).maybeSingle();
      if (error) return NextResponse.json({ error: `Domain request could not be loaded: ${error.message}` }, { status: 400 });
      if (!domainRequest) return NextResponse.json({ error: 'Submit a company access request first.' }, { status: 404 });
      if (domainRequest.verification_expires_at && new Date(domainRequest.verification_expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'The verification token has expired. Update the request to generate a new token.' }, { status: 410 });
      }
      if ((domainRequest.verification_attempts || 0) >= 10) {
        return NextResponse.json({ error: 'Verification attempt limit reached. Submit a new request or wait for administrator review.' }, { status: 429 });
      }
      await admin.from('company_domain_requests').update({
        verification_attempts: (domainRequest.verification_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', domainRequest.id);
      const recordName = `_buildbridge-verification.${domainRequest.email_domain}`;
      let values: string[] = [];
      try {
        values = (await resolveTxt(recordName)).map(parts => parts.join(''));
      } catch (cause) {
        const code = (cause as NodeJS.ErrnoException).code;
        if (code !== 'ENODATA' && code !== 'ENOTFOUND' && code !== 'ETIMEOUT') throw cause;
      }
      if (!values.includes(`buildbridge-verification=${domainRequest.dns_token}`)) {
        return NextResponse.json({ error: `DNS verification record was not found. Add TXT ${recordName} with value buildbridge-verification=${domainRequest.dns_token}, wait for DNS propagation, then retry.` }, { status: 409 });
      }
      const { data, error: updateError } = await admin.from('company_domain_requests')
        .update({ status: 'pending_admin_review', dns_verified_at: new Date().toISOString(), email_verified_at: domainRequest.email_verified_at || new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', domainRequest.id).select('id,email_domain,organization_name,dns_token,status,dns_verified_at,review_note,created_at').single();
      if (updateError) return NextResponse.json({ error: `DNS proof was found but the request could not be updated: ${updateError.message}` }, { status: 400 });
      return NextResponse.json({ request: data });
    }

    if (body.action === 'review') {
      if (identity.role !== 'admin') return NextResponse.json({ error: 'Only the configured platform administrator can review domain requests.' }, { status: 403 });
      if (!body.requestId || !['approved', 'rejected', 'additional_information_required'].includes(body.decision || '')) {
        return NextResponse.json({ error: 'Choose approve, reject or request additional information.' }, { status: 400 });
      }
      const { data: domainRequest, error } = await admin.from('company_domain_requests')
        .select('id,user_id,email_domain,organization_name,email_verified_at,dns_verified_at').eq('id', body.requestId).maybeSingle();
      if (error) return NextResponse.json({ error: `Request could not be loaded: ${error.message}` }, { status: 400 });
      if (!domainRequest) return NextResponse.json({ error: 'Company domain request not found.' }, { status: 404 });
      if (body.decision === 'approved' && (!domainRequest.dns_verified_at || !domainRequest.email_verified_at)) {
        return NextResponse.json({ error: 'Organization email and DNS ownership must both be verified before approval.' }, { status: 409 });
      }

      const { error: reviewError } = await admin.rpc('review_company_domain_request', {
        request_id: domainRequest.id,
        admin_user_id: identity.user.id,
        decision: body.decision,
        note: String(body.note || '').trim().slice(0, 1000),
      });
      if (reviewError) return NextResponse.json({ error: `Review decision could not be saved: ${reviewError.message}` }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported company domain action.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Company domain action failed.' }, { status: 500 });
  }
}
