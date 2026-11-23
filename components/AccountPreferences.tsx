'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Globe2, UserRound } from 'lucide-react';

type Preferences = {
  preferred_language: string;
  learning_personalization_enabled: boolean;
  bio: string | null;
  education_level: string | null;
  institution: string | null;
  field_of_study: string | null;
  profile_skills: string[];
  location: string | null;
  degree: string | null;
  department: string | null;
  academic_year: string | null;
  graduation_year: number | null;
  cgpa: number | null;
  coursework: string[];
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  email_enabled: boolean;
  project_updates: boolean;
  deadline_reminders: boolean;
  opportunity_updates: boolean;
  learning_updates: boolean;
  company_submission_updates: boolean;
  company_milestone_updates: boolean;
  company_applicant_updates: boolean;
  company_verification_updates: boolean;
  company_in_app_updates: boolean;
  admin_company_verifications: boolean;
  admin_ai_incidents: boolean;
  admin_database_errors: boolean;
  admin_certificate_errors: boolean;
  admin_email_failures: boolean;
};

const defaults: Preferences = {
  preferred_language: 'en', learning_personalization_enabled: true, bio: '', education_level: '',
  institution: '', field_of_study: '', profile_skills: [], location: '', degree: '', department: '',
  academic_year: '', graduation_year: null, cgpa: null, coursework: [], linkedin_url: '', github_url: '',
  portfolio_url: '', resume_url: '', email_enabled: true,
  project_updates: true, deadline_reminders: true, opportunity_updates: true, learning_updates: true,
  company_submission_updates: true, company_milestone_updates: true,
  company_applicant_updates: true, company_verification_updates: true,
  company_in_app_updates: true,
  admin_company_verifications: true, admin_ai_incidents: true,
  admin_database_errors: true, admin_certificate_errors: true,
  admin_email_failures: true,
};

export function ExtendedProfileFields() {
  const [values, setValues] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/preferences', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Profile preferences could not be loaded.');
      setValues({ ...defaults, ...(result.profile || {}), ...(result.notifications || {}) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profile preferences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Profile details could not be saved.');
      setMessage('Education and professional profile details saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Profile details could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setValues(current => ({ ...current, [key]: value }));
  const commaList = (key: 'profile_skills'|'coursework', value: string) => update(key, value.split(',').map(item => item.trim()).filter(Boolean).slice(0, 30));

  return <>
    <section className="panel profile-section extended-profile-fields">
      <h2><UserRound size={19}/> Education and professional profile</h2>
      {loading?<p className="muted">Loading profile details…</p>:<>
        <label>About me<textarea value={values.bio||''} maxLength={1000} onChange={event=>update('bio',event.target.value)}/></label>
        <div className="profile-fields-grid">
          <label>Education level<input value={values.education_level||''} maxLength={120} onChange={event=>update('education_level',event.target.value)} placeholder="e.g. Undergraduate"/></label>
          <label>Institution<input value={values.institution||''} maxLength={180} onChange={event=>update('institution',event.target.value)} placeholder="College or university"/></label>
          <label>Degree<input value={values.degree||''} maxLength={120} onChange={event=>update('degree',event.target.value)} placeholder="e.g. B.Tech"/></label>
          <label>Branch / department<input value={values.department||''} maxLength={160} onChange={event=>update('department',event.target.value)} placeholder="e.g. Computer Science"/></label>
          <label>Field of study<input value={values.field_of_study||''} maxLength={160} onChange={event=>update('field_of_study',event.target.value)} placeholder="e.g. Software Engineering"/></label>
          <label>Academic year<input value={values.academic_year||''} maxLength={80} onChange={event=>update('academic_year',event.target.value)} placeholder="e.g. 2nd year"/></label>
          <label>Graduation year<input type="number" min={1950} max={2200} value={values.graduation_year??''} onChange={event=>update('graduation_year',event.target.value?Number(event.target.value):null)}/></label>
          <label>CGPA / percentage<input type="number" min={0} max={100} step="0.01" value={values.cgpa??''} onChange={event=>update('cgpa',event.target.value?Number(event.target.value):null)}/></label>
          <label>Location<input value={values.location||''} maxLength={160} onChange={event=>update('location',event.target.value)} placeholder="City, country"/></label>
        </div>
        <label>Coursework and subjects (comma separated)<input value={(values.coursework||[]).join(', ')} onChange={event=>commaList('coursework',event.target.value)} placeholder="Data structures, DBMS, statistics"/></label>
        <label>Skills (comma separated)<input value={(values.profile_skills||[]).join(', ')} onChange={event=>commaList('profile_skills',event.target.value)} placeholder="SQL, React, Python, communication"/></label>
        <div className="profile-fields-grid profile-link-grid">
          <label>LinkedIn profile URL<input type="url" value={values.linkedin_url||''} onChange={event=>update('linkedin_url',event.target.value)} placeholder="https://www.linkedin.com/in/..."/></label>
          <label>GitHub profile URL<input type="url" value={values.github_url||''} onChange={event=>update('github_url',event.target.value)} placeholder="https://github.com/..."/></label>
          <label>Portfolio URL<input type="url" value={values.portfolio_url||''} onChange={event=>update('portfolio_url',event.target.value)} placeholder="https://..."/></label>
          <label>Resume link<input type="url" value={values.resume_url||''} onChange={event=>update('resume_url',event.target.value)} placeholder="Link to your current resume"/></label>
        </div>
        <p className="muted profile-privacy-note">These details help personalize learning and opportunity matching. Only add information you want included in your profile.</p>
      </>}
    </section>
    {error&&<p className="auth-message error" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></p>}
    {message&&<p className="auth-message" role="status">{message}</p>}
    {!loading&&<button className="primary" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save education and professional details'}</button>}
  </>;
}

export function NotificationSettings() {
  const [values, setValues] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<keyof Preferences|null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/preferences', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Notification preferences could not be loaded.');
      setValues(current => ({ ...current, ...(result.profile || {}), ...(result.notifications || {}) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Notification preferences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function change(key: keyof Preferences, value: boolean|string) {
    const previous = values[key];
    setValues(current=>({...current,[key]:value}));
    setBusyKey(key);
    setError('');
    try {
      const response = await fetch('/api/preferences', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({[key]:value}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Preference could not be saved.');
    } catch (cause) {
      setValues(current=>({...current,[key]:previous}));
      setError(cause instanceof Error ? cause.message : 'Preference could not be saved.');
    } finally {
      setBusyKey(null);
    }
  }

  return <section className="panel settings-panel account-preferences-panel">
    <h2><Bell size={19}/> Learning and notifications</h2>
    {error&&<p className="auth-message error" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></p>}
    {loading?<p className="muted">Loading preferences…</p>:<>
      <label className="preference-language"><Globe2 size={17}/> Recommendation language<select value={values.preferred_language} disabled={busyKey==='preferred_language'} onChange={event=>void change('preferred_language',event.target.value)}><option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="bn">Bengali</option><option value="mr">Marathi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="pt">Portuguese</option><option value="ar">Arabic</option><option value="ja">Japanese</option></select></label>
      <p className="muted">Video recommendations use this language when available. External search results may still include other languages.</p>
      <label className="toggle"><input type="checkbox" checked={values.learning_personalization_enabled} disabled={busyKey==='learning_personalization_enabled'} onChange={event=>void change('learning_personalization_enabled',event.target.checked)}/> Use my learning activity to personalize recommendations</label>
      <h3>Email notifications</h3>
      <label className="toggle"><input type="checkbox" checked={values.email_enabled} disabled={busyKey==='email_enabled'} onChange={event=>void change('email_enabled',event.target.checked)}/> Email notifications</label>
      {values.email_enabled&&<div className="preference-options">
        {([
          ['Project and review updates','project_updates'],
          ['Project deadline reminders','deadline_reminders'],
          ['Opportunity updates','opportunity_updates'],
          ['Learning updates','learning_updates'],
        ] as [string,keyof Preferences][]).map(([label,key])=><label className="toggle" key={key}><input type="checkbox" checked={Boolean(values[key])} disabled={busyKey===key} onChange={event=>void change(key,event.target.checked)}/>{label}</label>)}
      </div>}
    </>}
  </section>;
}

export function AdminNotificationSettings() {
  const [values, setValues] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<keyof Preferences|null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/preferences', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Administrator notification preferences could not be loaded.');
      setValues(current => ({ ...current, ...(result.notifications || {}) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Administrator notification preferences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function change(key: keyof Preferences, value: boolean) {
    const previous = values[key];
    setValues(current => ({ ...current, [key]: value }));
    setBusyKey(key);
    setError('');
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Administrator preference could not be saved.');
    } catch (cause) {
      setValues(current => ({ ...current, [key]: previous }));
      setError(cause instanceof Error ? cause.message : 'Administrator preference could not be saved.');
    } finally {
      setBusyKey(null);
    }
  }

  const items: Array<[string, keyof Preferences]> = [
    ['New company registrations and pending verification','admin_company_verifications'],
    ['AI provider failures and repeated Mentor failures','admin_ai_incidents'],
    ['Critical database and backend failures','admin_database_errors'],
    ['Certificate issuance errors','admin_certificate_errors'],
    ['Email delivery failures','admin_email_failures'],
  ];

  return <section className="panel settings-panel account-preferences-panel">
    <h2><Bell size={19}/> Administrator operational alerts</h2>
    {error&&<p className="auth-message error" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></p>}
    {loading?<p className="muted">Loading operational preferences…</p>:<>
      <label className="toggle"><input type="checkbox" checked={values.email_enabled} disabled={busyKey==='email_enabled'} onChange={event=>void change('email_enabled',event.target.checked)}/> Enable email alerts</label>
      {items.map(([label,key])=><label className="toggle" key={key}><input type="checkbox" checked={Boolean(values[key])} disabled={busyKey===key} onChange={event=>void change(key,event.target.checked)}/>{label}</label>)}
    </>}
  </section>;
}

export function CompanyNotificationSettings() {
  const [values, setValues] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<keyof Preferences|null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/preferences', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Company notification preferences could not be loaded.');
      setValues(current => ({ ...current, ...(result.notifications || {}) }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Company notification preferences could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function change(key: keyof Preferences, value: boolean) {
    const previous = values[key];
    setValues(current => ({ ...current, [key]: value }));
    setBusyKey(key);
    setError('');
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Company preference could not be saved.');
    } catch (cause) {
      setValues(current => ({ ...current, [key]: previous }));
      setError(cause instanceof Error ? cause.message : 'Company preference could not be saved.');
    } finally {
      setBusyKey(null);
    }
  }

  const groups: Array<[string, Array<[string, keyof Preferences]>]> = [
    ['Project management', [
      ['New project submissions','company_submission_updates'],
      ['Milestone review and deadline reminders','company_milestone_updates'],
    ]],
    ['Talent and opportunities', [
      ['New applications and applicant updates','company_applicant_updates'],
      ['Opportunity activity and deadline reminders','opportunity_updates'],
    ]],
    ['Organization', [
      ['Company verification and administrator decisions','company_verification_updates'],
      ['Organization account updates','project_updates'],
    ]],
  ];

  return <section className="panel settings-panel account-preferences-panel">
    <h2><Bell size={19}/> Company notifications</h2>
    {error&&<p className="auth-message error" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></p>}
    {loading?<p className="muted">Loading organization preferences…</p>:<>
      <label className="toggle"><input type="checkbox" checked={values.email_enabled} disabled={busyKey==='email_enabled'} onChange={event=>void change('email_enabled',event.target.checked)}/> Enable email notifications</label>
      <label className="toggle"><input type="checkbox" checked={values.company_in_app_updates} disabled={busyKey==='company_in_app_updates'} onChange={event=>void change('company_in_app_updates',event.target.checked)}/> Enable in-app notification updates</label>
      {groups.map(([title, items])=><div className="preference-options" key={title}>
        <h3>{title}</h3>
        {items.map(([label,key])=><label className="toggle" key={key}>
          <input type="checkbox" checked={Boolean(values[key])} disabled={busyKey===key} onChange={event=>void change(key,event.target.checked)}/>
          {label}
        </label>)}
      </div>)}
    </>}
  </section>;
}
