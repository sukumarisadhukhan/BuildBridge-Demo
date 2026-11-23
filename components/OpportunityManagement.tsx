'use client';

import { FormEvent, useMemo, useState } from 'react';
import { BriefcaseBusiness, CheckCircle2, Plus, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase';

type Opportunity = {
  id: string;
  created_by: string;
  title: string;
  kind: string;
  scope: string;
  deliverables: string;
  acceptance_criteria: string;
  required_skills?: string[];
  career_goals?: string[];
  experience_level?: string | null;
  location?: string | null;
  is_remote?: boolean;
  deadline?: string | null;
  payment_terms?: string | null;
  eligibility?: Record<string, unknown> | null;
  status: string;
};

type FormState = {
  title: string;
  kind: string;
  scope: string;
  deliverables: string;
  acceptanceCriteria: string;
  requiredSkills: string;
  careerGoals: string;
  experienceLevel: string;
  location: string;
  isRemote: boolean;
  deadline: string;
  paymentTerms: string;
  eligibility: string;
  minimumEducationLevel: string;
  minimumAcademicYear: string;
  minimumCgpa: string;
  eligibleLocations: string;
};

const blank: FormState = {
  title: '', kind: 'internship', scope: '', deliverables: '', acceptanceCriteria: '',
  requiredSkills: '', careerGoals: '', experienceLevel: 'Entry level', location: '',
  isRemote: false, deadline: '', paymentTerms: '', eligibility: '', minimumEducationLevel: '', minimumAcademicYear: '', minimumCgpa: '', eligibleLocations: '',
};

function splitList(value: string) {
  return [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))].slice(0, 20);
}

export function OpportunityManagement({ opportunities, verified, ownerId, onRefresh }: {
  opportunities: Opportunity[];
  verified: boolean;
  ownerId: string;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState<FormState>(blank);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const owned = useMemo(() => opportunities.filter(item => item.created_by === ownerId), [opportunities, ownerId]);

  async function post(payload: Record<string, unknown>) {
    const supabase = createClient();
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session?.access_token) throw new Error('Your sign-in session is missing. Sign in again.');
    const response = await fetch('/api/backend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ error: 'The server returned an unreadable response.' }));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result.data;
  }

  async function createOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified) { setError('Your company must be verified by an administrator before you can create or publish opportunities.'); return; }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post({
        action: 'create_opportunity',
        title: form.title,
        kind: form.kind,
        scope: form.scope,
        deliverables: form.deliverables,
        acceptanceCriteria: form.acceptanceCriteria,
        requiredSkills: splitList(form.requiredSkills),
        careerGoals: splitList(form.careerGoals),
        experienceLevel: form.experienceLevel,
        location: form.location,
        isRemote: form.isRemote,
        deadline: form.deadline || null,
        paymentTerms: form.paymentTerms,
        eligibility: { description: form.eligibility, minimumEducationLevel: form.minimumEducationLevel, minimumAcademicYear: form.minimumAcademicYear, minimumCgpa: form.minimumCgpa ? Number(form.minimumCgpa) : null, eligibleLocations: splitList(form.eligibleLocations) },
      });
      setForm(blank);
      setShowForm(false);
      setNotice('Opportunity saved as a draft. Review the details and publish it when ready.');
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Opportunity could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(opportunityId: string, status: 'published' | 'closed' | 'draft') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await post({ action: 'update_opportunity_status', opportunityId, status });
      setNotice(status === 'published' ? 'Opportunity published.' : status === 'closed' ? 'Opportunity closed.' : 'Opportunity moved to draft.');
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Opportunity status could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="opportunity-management">
    <section className="panel opportunity-management-intro"><div><span className="journey-kicker"><BriefcaseBusiness size={14}/> OPPORTUNITY WORKSPACE</span><h2>Connect real work to demonstrated skills.</h2><p>Publish clear internships, freelance assignments and paid micro-projects. Students see how their project evidence and demonstrated skills relate to your requirements.</p></div><span className={`verification-state ${verified?'verified':'pending'}`}>{verified?<><CheckCircle2 size={14}/> Company verified</>:'Verification pending'}</span></section>
    {!verified&&<div className="recommendation-error" role="status">Your organization must be verified before opportunities can be created or published. Complete Company Profile and the domain verification process first.</div>}
    <div className="section-title"><h2>Your opportunities</h2><button className="primary" disabled={!verified||busy} onClick={()=>{setShowForm(value=>!value);setError('');}}><Plus size={15}/>{showForm?'Close form':'Create opportunity'}</button></div>
    {showForm&&<form className="panel opportunity-editor" onSubmit={createOpportunity}>
      <div className="profile-fields-grid">
        <label>Opportunity title<input required minLength={4} maxLength={180} value={form.title} onChange={event=>setForm(value=>({...value,title:event.target.value}))} placeholder="e.g. Frontend development internship"/></label>
        <label>Opportunity type<select value={form.kind} onChange={event=>setForm(value=>({...value,kind:event.target.value}))}><option value="internship">Internship</option><option value="freelance">Freelance assignment</option><option value="paid_micro_project">Paid micro-project</option><option value="entry_level">Entry-level role</option><option value="other">Other</option></select></label>
        <label>Required skills (comma separated)<input value={form.requiredSkills} onChange={event=>setForm(value=>({...value,requiredSkills:event.target.value}))} placeholder="React, TypeScript, REST APIs"/></label>
        <label>Relevant career goals (comma separated)<input value={form.careerGoals} onChange={event=>setForm(value=>({...value,careerGoals:event.target.value}))} placeholder="Frontend Developer, Full-stack Developer"/></label>
        <label>Experience level<input value={form.experienceLevel} onChange={event=>setForm(value=>({...value,experienceLevel:event.target.value}))} placeholder="Entry level / 0-1 years"/></label>
        <label>Location<input value={form.location} onChange={event=>setForm(value=>({...value,location:event.target.value}))} placeholder="City, country or Remote"/></label>
        <label>Deadline<input type="date" value={form.deadline} onChange={event=>setForm(value=>({...value,deadline:event.target.value}))}/></label>
        <label>Compensation / payment terms<input value={form.paymentTerms} onChange={event=>setForm(value=>({...value,paymentTerms:event.target.value}))} placeholder="e.g. ₹10,000 per month or Not paid"/></label>
      </div>
      <label>Scope<textarea required maxLength={5000} value={form.scope} onChange={event=>setForm(value=>({...value,scope:event.target.value}))} placeholder="Describe the work, expected outcomes and time commitment."/></label>
      <label>Deliverables<textarea required maxLength={3000} value={form.deliverables} onChange={event=>setForm(value=>({...value,deliverables:event.target.value}))} placeholder="List the deliverables the student must submit."/></label>
      <label>Acceptance criteria<textarea required maxLength={3000} value={form.acceptanceCriteria} onChange={event=>setForm(value=>({...value,acceptanceCriteria:event.target.value}))} placeholder="Explain how the work will be reviewed."/></label>
      <div className="profile-fields-grid"><label>Minimum education level<input value={form.minimumEducationLevel} onChange={event=>setForm(value=>({...value,minimumEducationLevel:event.target.value}))} placeholder="e.g. Undergraduate"/></label><label>Minimum academic year<input value={form.minimumAcademicYear} onChange={event=>setForm(value=>({...value,minimumAcademicYear:event.target.value}))} placeholder="e.g. 2nd year"/></label><label>Minimum CGPA / percentage<input type="number" min="0" max="100" step="0.01" value={form.minimumCgpa} onChange={event=>setForm(value=>({...value,minimumCgpa:event.target.value}))} placeholder="Optional minimum"/></label><label>Eligible locations (comma separated)<input value={form.eligibleLocations} onChange={event=>setForm(value=>({...value,eligibleLocations:event.target.value}))} placeholder="India, Tamil Nadu, Remote"/></label></div>
      <label>Additional eligibility and other requirements<textarea maxLength={1500} value={form.eligibility} onChange={event=>setForm(value=>({...value,eligibility:event.target.value}))} placeholder="Work authorization, schedule, application requirements and other details."/></label>
      <label className="remember-option"><input type="checkbox" checked={form.isRemote} onChange={event=>setForm(value=>({...value,isRemote:event.target.checked}))}/> Remote opportunity</label>
      <div className="inline-actions"><button className="primary" type="submit" disabled={busy}>{busy?'Saving…':<><Save size={15}/> Save draft</>}</button><button className="outline" type="button" onClick={()=>setShowForm(false)}>Cancel</button></div>
      <p className="footnote">Publishing does not guarantee applications or selection. Only state compensation and deadlines that your organization can honour.</p>
    </form>}
    {error&&<p className="auth-message error" role="alert">{error}</p>}{notice&&<p className="auth-message" role="status">{notice}</p>}
    {owned.length===0?<div className="panel empty-state"><BriefcaseBusiness size={32}/><h3>No opportunities created yet</h3><p>Once your organization is verified, create a scoped opportunity with requirements and clear review criteria.</p></div>:<div className="opportunity-list">{owned.map(opportunity=><article className="panel managed-opportunity" key={opportunity.id}><div className="managed-opportunity-head"><div><span className="tag-row"><span className="pill">{opportunity.kind.replace(/_/g,' ')}</span><span className={`pill ${opportunity.status==='published'?'verified-pill':'muted-pill'}`}>{opportunity.status}</span></span><h3>{opportunity.title}</h3></div><div className="managed-opportunity-actions">{opportunity.status==='published'?<button className="outline" disabled={busy} onClick={()=>void updateStatus(opportunity.id,'closed')}>Close opportunity</button>:<button className="primary" disabled={busy||!verified} onClick={()=>void updateStatus(opportunity.id,'published')}>Publish</button>}</div></div><p>{opportunity.scope}</p><div className="tag-row">{(opportunity.required_skills||[]).map(skill=><span className="skill-chip" key={skill}>{skill}</span>)}</div><div className="managed-opportunity-meta"><span>Deadline: {opportunity.deadline||'Not specified'}</span><span>Compensation: {opportunity.payment_terms||'Not stated'}</span><span>Experience: {opportunity.experience_level||'Not stated'}</span><span>Location: {opportunity.is_remote?'Remote':opportunity.location||'Not stated'}</span></div></article>)}</div>}
  </div>;
}
