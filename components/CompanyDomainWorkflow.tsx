'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, CheckCircle2, ShieldCheck } from 'lucide-react';

type DomainRequest = {
  id: string;
  user_id?: string;
  email_domain: string;
  organization_name: string;
  dns_token?: string;
  status: string;
  dns_verified_at: string | null;
  review_note?: string | null;
  official_website?: string | null;
  organization_email?: string | null;
  business_registration?: string | null;
  country_of_registration?: string | null;
  organization_type?: string | null;
  description?: string | null;
  authorized_representative_name?: string | null;
  authorized_representative_title?: string | null;
  authorized_representative_phone?: string | null;
  email_verified_at?: string | null;
  verification_attempts?: number;
  verification_expires_at?: string | null;
  previous_status?: string | null;
  created_at: string;
  profile?: { email: string; full_name: string | null };
  requester?: { email: string; full_name: string | null };
  reviewer?: { email: string; full_name: string | null };
};

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, cache: 'no-store' });
  const result = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}

export function CompanyDomainRequest() {
  const [request, setRequest] = useState<DomainRequest | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [domain, setDomain] = useState('');
  const [organizationEmail, setOrganizationEmail] = useState('');
  const [officialWebsite, setOfficialWebsite] = useState('');
  const [businessRegistration, setBusinessRegistration] = useState('');
  const [country, setCountry] = useState('');
  const [organizationType, setOrganizationType] = useState('');
  const [description, setDescription] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeTitle, setRepresentativeTitle] = useState('');
  const [representativePhone, setRepresentativePhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await requestJson('/api/company-domain');
      setRequest(result.request || null);
      if (result.request) {
        setOrganizationName(result.request.organization_name);
        setDomain(result.request.email_domain);
        setOrganizationEmail(result.request.organization_email || '');
        setOfficialWebsite(result.request.official_website || '');
        setBusinessRegistration(result.request.business_registration || '');
        setCountry(result.request.country_of_registration || '');
        setOrganizationType(result.request.organization_type || '');
        setDescription(result.request.description || '');
        setRepresentativeName(result.request.authorized_representative_name || '');
        setRepresentativeTitle(result.request.authorized_representative_title || '');
        setRepresentativePhone(result.request.authorized_representative_phone || '');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company access request could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(action: 'request'|'verify_dns') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestJson('/api/company-domain', {
        method: 'POST',
        body: JSON.stringify(action === 'request'
          ? {
              action,
              organizationName,
              domain,
              organizationEmail,
              officialWebsite,
              businessRegistration,
              countryOfRegistration: country,
              organizationType,
              description,
              authorizedRepresentativeName: representativeName,
              authorizedRepresentativeTitle: representativeTitle,
              authorizedRepresentativePhone: representativePhone,
            }
          : { action }),
      });
      if (result.request) setRequest(result.request);
      setMessage(action === 'request' ? 'Request saved. Add the provided TXT record, then verify domain ownership.' : 'Domain ownership verified. Your request is awaiting administrator review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company access could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel company-domain-panel">
    <h2><Building2 size={19}/> Company account access</h2>
    <p className="muted">Company access requires a confirmed organization email, DNS proof and administrator approval. Domain approval does not verify the company or unlock project publishing.</p>
    {loading ? <p className="muted">Checking your request…</p> : error && !request ? <div className="notice" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></div> : <>
      {request?.status === 'approved' ? <div className="company-domain-status"><CheckCircle2/><b>Company verification approved</b><span>The administrator has manually approved this organization and its publishing privileges are unlocked.</span></div> : <>
        <div className="company-domain-fields">
          <label>Organization name<input value={organizationName} maxLength={160} onChange={event=>setOrganizationName(event.target.value)} placeholder="Organization name"/></label>
          <label>Organization email<input type="email" value={organizationEmail} maxLength={320} onChange={event=>setOrganizationEmail(event.target.value)} placeholder="representative@company.example"/></label>
          <label>Organization domain<input value={domain} maxLength={253} onChange={event=>setDomain(event.target.value)} placeholder="company.example"/></label>
          <label>Official website<input type="url" value={officialWebsite} maxLength={500} onChange={event=>setOfficialWebsite(event.target.value)} placeholder="https://company.example"/></label>
          <label>Business registration details<input value={businessRegistration} maxLength={500} onChange={event=>setBusinessRegistration(event.target.value)} placeholder="Registration number or legal identifier"/></label>
          <label>Country of registration<input value={country} maxLength={120} onChange={event=>setCountry(event.target.value)} placeholder="Country"/></label>
          <label>Organization type<select value={organizationType} onChange={event=>setOrganizationType(event.target.value)}><option value="">Select type</option><option>Private company</option><option>Public company</option><option>Startup</option><option>Nonprofit</option><option>University</option><option>Government</option><option>Other</option></select></label>
          <label>Authorized representative name<input value={representativeName} maxLength={120} onChange={event=>setRepresentativeName(event.target.value)} placeholder="Full name"/></label>
          <label>Representative title<input value={representativeTitle} maxLength={120} onChange={event=>setRepresentativeTitle(event.target.value)} placeholder="Title or role"/></label>
          <label>Representative phone<input value={representativePhone} maxLength={40} onChange={event=>setRepresentativePhone(event.target.value)} placeholder="Phone number"/></label>
          <label>Organization description<textarea value={description} maxLength={3000} onChange={event=>setDescription(event.target.value)} placeholder="Briefly describe the organization and work it performs."/></label>
        </div>
        <button className="primary" disabled={busy||['pending_admin','pending_admin_review','approved'].includes(request?.status||'')} onClick={()=>void submit('request')}>{busy?'Saving…':request?'Update verification request':'Submit company verification request'}</button>
      </>}
      {request?.dns_token && request.status !== 'approved' && <div className="dns-proof">
        <b>Prove domain ownership</b>
        <p>Add this TXT record at your DNS provider:</p>
        <code>Host: _buildbridge-verification.{request.email_domain}<br/>Value: buildbridge-verification={request.dns_token}</code>
        <p>Status: <strong>{['pending_admin','pending_admin_review'].includes(request.status) ? 'DNS verified · waiting for administrator review' : request.status === 'additional_information_required' ? 'Additional information required' : 'DNS verification required'}</strong></p>
        {!['pending_admin','pending_admin_review','approved'].includes(request.status) && <button className="outline" disabled={busy} onClick={()=>void submit('verify_dns')}>{busy?'Checking DNS…':'Verify DNS record'}</button>}
      </div>}
      {request?.review_note && <p className="notice">{request.review_note}</p>}
      {(error||message)&&<p className={error?'auth-message error':'auth-message'} role={error?'alert':'status'}>{error||message}</p>}
    </>}
  </section>;
}

export function AdminCompanyDomainRequests() {
  const [requests, setRequests] = useState<DomainRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [reviewNote, setReviewNote] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await requestJson('/api/company-domain');
      setRequests(Array.isArray(result.requests) ? result.requests : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company domain requests could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(item: DomainRequest, decision: 'approved'|'rejected'|'additional_information_required') {
    setBusyId(item.id);
    setError('');
    try {
      await requestJson('/api/company-domain', { method: 'POST', body: JSON.stringify({ action: 'review', requestId: item.id, decision, note: reviewNote[item.id] || '' }) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Domain review could not be saved.');
    } finally {
      setBusyId('');
    }
  }

  return <section className="panel admin-domain-requests">
    <h2><ShieldCheck size={19}/> Company domain requests</h2>
    <p className="muted">DNS proof establishes domain control only. Review organization access separately from company verification.</p>
    {error&&<div className="notice" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></div>}
    {loading?<p className="muted">Loading domain requests…</p>:requests.length===0?<p className="muted">No company domain requests have been submitted.</p>:requests.map(item=><article className="roadmap-row" key={item.id}>
      <div>
        <b>{item.organization_name} · {item.email_domain}</b>
        <small>Requester: {item.requester?.full_name||item.requester?.email||item.profile?.full_name||item.profile?.email||item.user_id} · {item.status}</small>
        {item.reviewer && <small>Reviewer: {item.reviewer.full_name||item.reviewer.email}</small>}
        <small>Email: {item.email_verified_at?'Verified':'Pending'} · DNS: {item.dns_verified_at?'Verified':'Pending'}</small>
        {item.official_website&&<small>Website: {item.official_website}</small>}
        {item.organization_type&&<small>Type: {item.organization_type} · Country: {item.country_of_registration||'Not stated'}</small>}
        {item.business_registration&&<small>Registration: {item.business_registration}</small>}
        {item.description&&<small>Description: {item.description}</small>}
        {item.authorized_representative_name&&<small>Representative: {item.authorized_representative_name}{item.authorized_representative_title?`, ${item.authorized_representative_title}`:''}{item.authorized_representative_phone?` · ${item.authorized_representative_phone}`:''}</small>}
        {item.review_note&&<small>Review note: {item.review_note}</small>}
      </div>
      {['pending_admin','pending_admin_review'].includes(item.status)&&<div className="inline-actions company-review-actions">
        <label>Review reason / request<textarea value={reviewNote[item.id]||''} maxLength={1000} onChange={event=>setReviewNote(current=>({...current,[item.id]:event.target.value}))} placeholder="Required for rejection or additional information."/></label>
        <button className="small-primary" disabled={!!busyId||!item.dns_verified_at||!item.email_verified_at} onClick={()=>void review(item,'approved')}>{busyId===item.id?'Saving…':'Approve company'}</button>
        <button className="outline" disabled={!!busyId} onClick={()=>void review(item,'additional_information_required')}>Request information</button>
        <button className="outline" disabled={!!busyId} onClick={()=>void review(item,'rejected')}>Reject</button>
      </div>}
    </article>)}
  </section>;
}
