'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  Link2,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { projectApi } from '@/lib/project-api-client';
import { createClient } from '@/lib/supabase';

type VaultArtifact = {
  id: string;
  artifact_type: string;
  title: string;
  description: string;
  external_url: string | null;
  storage_path: string | null;
  signedUrl?: string | null;
  project_id: string | null;
  milestone_id: string | null;
  evidence_id: string | null;
  skill_names: string[];
  source_organization: string | null;
  verification_status: string;
  status: string;
  created_at: string;
};

type VaultData = {
  learningResources: any[];
  learningHistory: any[];
  coursework: any[];
  skills: any[];
  projects: any[];
  submissions: any[];
  certificates: any[];
  theoryCertificates: any[];
  artifacts: VaultArtifact[];
  timeline: Array<{
    id: string;
    date: string;
    category: string;
    title: string;
    description: string;
    projectId?: string;
    url?: string;
  }>;
};

function dateLabel(value?: string) {
  return value ? new Date(value).toLocaleDateString() : 'Date unavailable';
}

export function StudentVault() {
  const [data, setData] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [organization, setOrganization] = useState('all');
  const [sort, setSort] = useState<'recent' | 'oldest'>('recent');
  const [selectedProject, setSelectedProject] = useState<VaultData['projects'][number] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [artifactType, setArtifactType] = useState('learning_resource');
  const [externalUrl, setExternalUrl] = useState('');
  const [sourceOrganization, setSourceOrganization] = useState('');
  const [skills, setSkills] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await projectApi<VaultData>('/api/vault'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The learning and work vault could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const organizations = useMemo(() => {
    const values = new Set<string>();
    for (const assignment of data?.projects || []) {
      const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
      if (project?.project_source === 'company') values.add(project.organization_name || 'Company assignment');
    }
    for (const artifact of data?.artifacts || []) {
      if (artifact.source_organization) values.add(artifact.source_organization);
    }
    return [...values].sort();
  }, [data]);

  const filteredTimeline = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const result = data.timeline.filter((item) => {
      const project = item.projectId
        ? data.projects.find((assignment) => {
            const record = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
            return record?.id === item.projectId;
          })
        : null;
      const projectRecord = project
        ? (Array.isArray(project.project) ? project.project[0] : project.project)
        : null;
      const organizationName = projectRecord?.organization_name || '';
      const projectStatus = project?.status || '';
      return (!query || `${item.title} ${item.description} ${item.category}`.toLowerCase().includes(query))
        && (category === 'all' || item.category === category)
        && (status === 'all'
          || (status === 'completed' && (projectStatus === 'completed' || item.category === 'achievement'))
          || (status === 'in_progress' && projectStatus !== 'completed'))
        && (organization === 'all' || organizationName === organization);
    });
    return result.sort((a, b) => {
      const difference = new Date(b.date).getTime() - new Date(a.date).getTime();
      return sort === 'recent' ? difference : -difference;
    });
  }, [data, search, category, status, organization, sort]);

  async function addArtifact() {
    if (!title.trim()) return setError('Artifact title is required.');
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('Sign in again to add a vault record.');
      const form = new FormData();
      form.set('title', title.trim());
      form.set('description', description.trim());
      form.set('artifactType', artifactType);
      form.set('externalUrl', externalUrl.trim());
      form.set('sourceOrganization', sourceOrganization.trim());
      form.set('skills', skills);
      if (file) form.set('file', file);
      const response = await fetch('/api/vault', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({ error: 'The vault service returned an unreadable response.' }));
      if (!response.ok) throw new Error(result.error || 'Vault artifact could not be saved.');
      setTitle('');
      setDescription('');
      setExternalUrl('');
      setSourceOrganization('');
      setSkills('');
      setFile(null);
      setShowAdd(false);
      setMessage('Vault record added.');
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vault artifact could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteArtifact(artifact: VaultArtifact) {
    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('Sign in again to manage vault records.');
      const response = await fetch('/api/vault', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ artifactId: artifact.id }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({ error: 'The vault service returned an unreadable response.' }));
      if (!response.ok) throw new Error(result.error || 'Vault artifact could not be deleted.');
      setMessage('Vault record deleted.');
      setRefreshKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vault artifact could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  function openProject(assignment: VaultData['projects'][number]) {
    setSelectedProject(assignment);
  }

  if (loading) return <section className="vault-page"><div className="project-skeletons" aria-label="Loading learning and work vault"><i/><i/><i/></div></section>;

  return <section className="vault-page">
    <div className="vault-header">
      <div>
        <p className="journey-kicker">STUDENT PORTFOLIO</p>
        <h2>My Learning &amp; Work Vault</h2>
        <p className="muted">Everything you&apos;ve learned, built, submitted and achieved, organised in one place.</p>
      </div>
      <button className="outline" onClick={() => setShowAdd((current) => !current)}><Upload size={16}/>{showAdd ? 'Close' : 'Add supporting document'}</button>
    </div>

    {error && <div className="project-error" role="alert"><p>{error}</p><button className="outline" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div>}
    {message && <div className="notice" role="status">{message}</div>}

    {showAdd && <section className="panel vault-add-panel">
      <h3>Add optional supporting evidence</h3>
      <div className="profile-fields-grid">
        <label>Record type<select value={artifactType} onChange={(event) => setArtifactType(event.target.value)}>
          <option value="learning_resource">Learning resource</option>
          <option value="study_note">Study note</option>
          <option value="project_evidence">Project evidence</option>
          <option value="report">Report or document</option>
          <option value="external_link">External link</option>
          <option value="submission">Submission</option>
          <option value="achievement">Achievement</option>
        </select></label>
        <label>Title<input value={title} maxLength={180} onChange={(event) => setTitle(event.target.value)} placeholder="Record title"/></label>
        <label>Organization or source<input value={sourceOrganization} maxLength={180} onChange={(event) => setSourceOrganization(event.target.value)} placeholder="Organization, platform or issuer"/></label>
        <label>Associated skills<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="React, SQL, Project Management"/></label>
        <label>External URL<input type="url" value={externalUrl} maxLength={1000} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://..."/></label>
        <label>Upload file<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.docx,.pptx,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
      </div>
      <label>Description<textarea value={description} maxLength={3000} onChange={(event) => setDescription(event.target.value)} placeholder="What is this record?"/></label>
      <div className="project-card-actions"><button className="primary" disabled={busy} onClick={() => void addArtifact()}>{busy ? 'Saving…' : 'Save vault record'}</button><button className="outline" onClick={() => setShowAdd(false)}>Cancel</button></div>
    </section>}

    <div className="vault-filters" role="search">
      <label className="vault-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search project, skill or resource"/></label>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>
        <option value="all">All categories</option>
        <option value="learning">Learning</option>
        <option value="work">Projects and work</option>
        <option value="achievement">Achievements</option>
      </select></label>
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="all">All statuses</option>
        <option value="completed">Completed</option>
        <option value="in_progress">In progress</option>
      </select></label>
      <label>Organization<select value={organization} onChange={(event) => setOrganization(event.target.value)}>
        <option value="all">All organizations</option>
        {organizations.map((item) => <option key={item}>{item}</option>)}
      </select></label>
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'oldest')}>
        <option value="recent">Most recent</option>
        <option value="oldest">Oldest</option>
      </select></label>
    </div>

    <div className="vault-summary-grid">
      <article><BookOpen/><div><b>{data?.learningResources.length || 0}</b><span>Saved resources</span></div></article>
      <article><Award/><div><b>{data?.skills.length || 0}</b><span>Skill evidence records</span></div></article>
      <article><FolderKanban/><div><b>{data?.projects.length || 0}</b><span>Project assignments</span></div></article>
      <article><FileText/><div><b>{(data?.certificates.length || 0) + (data?.theoryCertificates.length || 0)}</b><span>Credentials</span></div></article>
    </div>

    <div className="vault-section-grid">
      <section className="panel vault-section">
        <div className="section-title"><h3>Learning resources</h3><span className="pill blue">{data?.learningResources.length || 0}</span></div>
        {data?.learningResources.length ? data.learningResources.map((item) =>
          <article className="vault-record" key={item.id}>
            <Link2 size={16}/><div><b>{item.title}</b><small>{item.channel || 'External learning resource'} · {dateLabel(item.created_at)}</small></div>
            {item.video_id && <a className="outline" href={`https://www.youtube.com/watch?v=${encodeURIComponent(item.video_id)}`} target="_blank" rel="noopener noreferrer">Open <ExternalLink size={14}/></a>}
          </article>
        ) : <p className="muted">Saved learning resources will appear here.</p>}
      </section>

      <section className="panel vault-section">
        <div className="section-title"><h3>Skills and evidence</h3><span className="pill green">{data?.skills.length || 0}</span></div>
        {data?.skills.length ? data.skills.map((item) =>
          <article className="vault-record" key={item.id}>
            <Award size={16}/><div><b>{item.skill}</b><small>{item.status.replaceAll('_', ' ')} · {item.source_type || 'Recorded evidence'} · {dateLabel(item.created_at)}</small></div>
          </article>
        ) : <p className="muted">Demonstrated and company-verified skills will appear here.</p>}
      </section>
    </div>

    <section className="panel vault-section">
      <div className="section-title"><h3>Projects and professional work</h3><span className="pill blue">{data?.projects.length || 0}</span></div>
      {data?.projects.length ? <div className="vault-project-grid">{data.projects.map((assignment) => {
        const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
        if (!project) return null;
        return <article className="vault-project-card" key={assignment.id}>
          <div className="marketplace-card-heading"><span className={`project-source ${project.project_source === 'company' ? 'company-source' : 'practice-source'}`}>{project.project_source === 'company' ? 'Company assignment' : 'BuildBridge practice project'}</span><span className="pill blue">{assignment.status.replaceAll('_', ' ')}</span></div>
          <h3>{project.title}</h3>
          <p>{project.scope}</p>
          {project.required_skills?.length ? <div className="project-skills">{project.required_skills.map((skill: string) => <span key={skill}>{skill}</span>)}</div> : null}
          <small>Started {dateLabel(assignment.started_at)}{assignment.completed_at ? ` · Completed ${dateLabel(assignment.completed_at)}` : ''}</small>
          <div className="project-card-actions"><button className="outline" onClick={() => openProject(assignment)}>View evidence</button></div>
        </article>;
      })}</div> : <p className="muted">Project assignments and practice work will appear here.</p>}
    </section>

    {selectedProject && <section className="panel vault-project-detail">
      <div className="section-title"><h3>Project evidence</h3><button className="text-btn" onClick={() => setSelectedProject(null)}>Close</button></div>
      {(data?.submissions || []).filter((submission) => submission.project_id === selectedProject.project_id).map((submission) =>
        <article className="submission-status" key={submission.id}>
          <b>{submission.status.replaceAll('_', ' ')}</b>
          <small>{dateLabel(submission.created_at)} · {submission.company_decision || 'Company decision pending'}</small>
          {submission.reflection && <p>{submission.reflection}</p>}
          {submission.company_feedback && <p><b>Company feedback:</b> {submission.company_feedback}</p>}
        </article>
      )}
    </section>}

    <section className="panel vault-section">
      <div className="section-title"><h3>Additional vault records</h3><span className="pill blue">{data?.artifacts.length || 0}</span></div>
      {data?.artifacts.length ? <div className="vault-project-grid">{data.artifacts.map((artifact) =>
        <article className="vault-project-card" key={artifact.id}>
          <div className="marketplace-card-heading"><span className="project-source practice-source">{artifact.artifact_type.replaceAll('_', ' ')}</span><span className="pill green">{artifact.verification_status.replaceAll('_', ' ')}</span></div>
          <h3>{artifact.title}</h3>
          {artifact.description && <p>{artifact.description}</p>}
          {artifact.skill_names?.length ? <div className="project-skills">{artifact.skill_names.map((skill) => <span key={skill}>{skill}</span>)}</div> : null}
          <small>{artifact.source_organization || 'Student record'} · {dateLabel(artifact.created_at)}</small>
          <div className="project-card-actions">
            {artifact.signedUrl && <a className="outline" href={artifact.signedUrl} target="_blank" rel="noopener noreferrer">Open file <ExternalLink size={14}/></a>}
            {artifact.external_url && <a className="outline" href={artifact.external_url} target="_blank" rel="noopener noreferrer">Open link <ExternalLink size={14}/></a>}
            <button className="text-btn" disabled={busy} onClick={() => void deleteArtifact(artifact)}><Trash2 size={14}/>Delete</button>
          </div>
        </article>
      )}</div> : <p className="muted">Uploaded reports, notes and external work records will appear here.</p>}
    </section>

    <section className="panel vault-timeline">
      <div className="section-title"><h3>Learning and achievement timeline</h3><span className="pill purple">{filteredTimeline.length}</span></div>
      {filteredTimeline.length ? <div className="vault-timeline-list">{filteredTimeline.map((item) =>
        <article key={item.id}>
          <div className="vault-timeline-icon">{item.category === 'achievement' ? <Award/> : item.category === 'learning' ? <BookOpen/> : <FolderKanban/>}</div>
          <div><small><Clock3 size={13}/>{dateLabel(item.date)}</small><b>{item.title}</b><p>{item.description}</p>{item.url && <a className="outline" href={item.url} target="_blank" rel="noopener noreferrer">View verification <ExternalLink size={14}/></a>}</div>
        </article>
      )}</div> : <p className="muted">No timeline records match these filters.</p>}
    </section>
  </section>;
}
