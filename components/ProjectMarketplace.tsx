'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileCheck2, FolderKanban, Search } from 'lucide-react';
import { PROJECT_CATEGORIES } from '@/lib/project-input';
import { projectApi } from '@/lib/project-api-client';
import { createClient } from '@/lib/supabase';
import { SafeMarkdown } from '@/components/SafeMarkdown';

type Project = {
  id: string;
  title: string;
  project_source: 'company' | 'practice';
  organization_name: string;
  company_verified: boolean;
  status: string;
  category: string;
  difficulty: string;
  project_type: string;
  required_skills: string[];
  estimated_duration_days: number | null;
  deadline: string | null;
  payment_terms: string | null;
  problem_statement: string;
  scope: string;
  deliverables: string | null;
  acceptance_criteria: string | null;
  project_milestones: Array<{
    id: string;
    sequence: number;
    sequence_number?: number;
    title: string;
    description: string;
    acceptance_criteria: string;
    required_deliverables?: string[];
    deadline?: string | null;
    is_required?: boolean;
  }>;
  created_at: string;
};

type Assignment = {
  id: string;
  status: string;
  started_at: string;
  project: Project;
  milestone_progress: Array<{
    milestone_id: string;
    status: 'not_started' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved' | 'completed';
    submission_id: string | null;
    feedback: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    completed_at: string | null;
  }>;
  submissions: Array<{
    id: string;
    status: string;
    created_at: string;
    milestone_id: string | null;
    company_feedback: string | null;
    evidence: { fileName?: string; storagePath?: string } | null;
    reflection: string | null;
    reviewed_at: string | null;
  }>;
};

function useProjectData<T>(path: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    projectApi<T[]>(path)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Project data could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [path, refreshKey]);

  return { data, loading, error, refresh };
}

function ProjectSource({ project }: { project: Project }) {
  if (project.project_source === 'practice') return <span className="project-source practice-source">BuildBridge Practice Project</span>;
  return <span className="project-source company-source">{project.company_verified ? 'Verified Company Project' : 'Company Project · verification unavailable'} · {project.organization_name}</span>;
}

type ExternalListing = {
  id: string;
  externalId: string;
  provider: string;
  title: string;
  description: string;
  sourceUrl: string;
  applicationUrl?: string;
  organization?: string;
  repository?: string;
  category: 'open_source' | 'competition' | 'hackathon' | 'internship' | 'freelance' | 'project_challenge';
  skills: string[];
  programmingLanguages?: string[];
  difficulty?: string;
  compensation?: string;
  eligibility?: string;
  location?: string;
  remote?: boolean;
  deadline?: string;
  publishedAt?: string;
  updatedAt?: string;
  lastVerifiedAt: string;
  status: 'active' | 'expired' | 'unknown';
  external: true;
};

type ExternalMatch = {
  demonstratedSkills: string[];
  missingSkills: string[];
  reason: string;
  fit: 'demonstrated' | 'provisional';
  eligibility: string;
};

type ExternalDiscovery = {
  listings: ExternalListing[];
  matches: Record<string, ExternalMatch>;
  page: number;
  perPage: number;
  hasMore: boolean;
  providerStatus: { github: 'ok' | 'empty' | 'error'; githubMessage?: string };
};

function OnlineProjectDiscovery({ careerGoal }: { careerGoal: string }) {
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState<'newest' | 'relevance'>('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExternalDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailsId, setDetailsId] = useState('');
  const [explanationId, setExplanationId] = useState('');
  const [explanation, setExplanation] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        provider: 'github',
        category: 'open_source',
        sort,
        page: String(page),
      });
      if (search.trim()) params.set('q', search.trim());
      if (skill.trim()) params.set('skill', skill.trim());
      if (language.trim()) params.set('language', language.trim());
      const result = await projectApi<ExternalDiscovery>(`/api/external-projects?${params.toString()}`);
      setData((current) => {
        if (page === 1) return result;
        const combined = new Map((current?.listings || []).map((listing) => [listing.id, listing]));
        for (const listing of result.listings) combined.set(listing.id, listing);
        return { ...result, listings: [...combined.values()] };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'GitHub project discovery could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [search, skill, language, sort, page]);

  useEffect(() => { void load(); }, [load]);

  function reset() {
    setSearch('');
    setSkill('');
    setLanguage('');
    setSort('newest');
    setPage(1);
  }

  async function explainIssue(listing: ExternalListing) {
    if (explanation[listing.id]) return;
    setExplanationId(listing.id);
    setError('');
    try {
      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('Sign in to explain this issue.');
      const prompt = `Explain this GitHub open-source issue to a student. Do not assume technologies not stated. Repository: ${listing.repository || listing.organization || 'Unknown'}. Issue title: ${listing.title}. Original description: ${listing.description}. Return 4 short sections: what the repository does if inferable, the problem, technical concepts, and a safe starting approach. Clearly mark unknowns.`;
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: 'mentor', prompt, pageContext: 'Online Projects', conversationId: null }),
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({ error: 'The AI explanation could not be read.' }));
      if (!response.ok) throw new Error(result.error || 'AI explanation could not be generated.');
      setExplanation((current) => ({ ...current, [listing.id]: String(result.text || 'No explanation was returned.') }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AI explanation could not be generated.');
    } finally {
      setExplanationId('');
    }
  }

  return <section className="external-project-marketplace">
    <div className="section-title">
      <div><h2>Online Projects</h2><p className="muted">Live open-source contribution tasks discovered from GitHub.</p></div>
      {data?.listings ? <span className="pill blue">{data.listings.length} listings</span> : null}
    </div>
    <div className="project-filters external-project-filters" role="search">
      <label className="project-search"><Search size={17}/><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search open-source projects for ${careerGoal}`}/></label>
      <label>Skill<input value={skill} onChange={(event) => { setSkill(event.target.value); setPage(1); }} placeholder="e.g. React, SQL"/></label>
      <label>Programming language<input value={language} onChange={(event) => { setLanguage(event.target.value); setPage(1); }} placeholder="e.g. Python"/></label>
      <label>Provider<select value="github" disabled><option value="github">GitHub</option></select></label>
      <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value as 'newest' | 'relevance'); setPage(1); }}><option value="newest">Newest</option><option value="relevance">Relevance</option></select></label>
      <button className="outline" type="button" onClick={reset}>Reset filters</button>
    </div>
    {loading ? <div className="project-skeletons" aria-label="Loading online projects" aria-busy="true"><i/><i/></div>
      : error ? <div className="project-error" role="alert"><p>{error}</p><button className="outline" onClick={() => void load()}>Retry GitHub</button></div>
        : data?.providerStatus.github === 'error' ? <div className="project-error" role="alert"><p>{data.providerStatus.githubMessage || 'GitHub is currently unavailable.'}</p><button className="outline" onClick={() => void load()}>Retry GitHub</button></div>
          : !data?.listings.length ? <div className="empty-state"><FolderKanban size={40}/><h3>No matching GitHub projects found</h3><p>Adjust the search, skill or language filters and try again. BuildBridge only shows live source listings.</p><button className="outline" onClick={reset}>Reset filters</button></div>
            : <>
              <div className="project-catalogue-grid">
                {data.listings.map((listing) => {
                  const match = data.matches[listing.id];
                  return <article className="marketplace-project-card external-marketplace-card" key={listing.id}>
                    <div className="marketplace-card-heading">
                      <span className="project-source external-source">External · GitHub</span>
                      <span className="pill green">Open contribution</span>
                    </div>
                    <h3>{listing.title}</h3>
                    <p className="project-organization">{listing.repository || listing.organization || 'GitHub repository'}</p>
                    <p className="project-problem">{listing.description || 'No description was supplied by GitHub.'}</p>
                    <div className="project-card-facts">
                      <span>Open-source contribution</span>
                      {listing.difficulty && <span>{listing.difficulty}</span>}
                      {listing.programmingLanguages?.map((item) => <span key={item}>{item}</span>)}
                    </div>
                    {listing.skills.length > 0 && <div className="project-skills">{listing.skills.slice(0, 12).map((item) => <span key={item}>{item}</span>)}</div>}
                    {match && <div className="external-match-reason"><b>{match.fit === 'demonstrated' ? 'Evidence-based match' : 'Provisional match'}</b><p>{match.reason}</p>
                      {match.demonstratedSkills.length > 0 && <small>Demonstrated matches: {match.demonstratedSkills.join(', ')}</small>}
                      {match.missingSkills.length > 0 && <small>Missing or not demonstrated: {match.missingSkills.join(', ')}</small>}
                      <small>Eligibility: {match.eligibility}</small>
                    </div>}
                    <div className="project-card-meta">
                      <span>Updated: {listing.updatedAt ? new Date(listing.updatedAt).toLocaleDateString() : 'Not supplied'}</span>
                      <span>Last checked: {new Date(listing.lastVerifiedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="project-card-actions">
                      <a className="primary" href={listing.applicationUrl || listing.sourceUrl} target="_blank" rel="noopener noreferrer">Open GitHub issue <ExternalLink size={14}/></a>
                      {listing.repository && <a className="outline" href={`https://github.com/${listing.repository}`} target="_blank" rel="noopener noreferrer">Repository <ExternalLink size={14}/></a>}
                      <button className="outline" type="button" disabled={explanationId === listing.id} onClick={() => void explainIssue(listing)}>{explanationId === listing.id ? 'Explaining…' : 'Explain with AI'}</button>
                      <button className="text-btn" type="button" onClick={() => setDetailsId((current) => current === listing.id ? '' : listing.id)}>{detailsId === listing.id ? 'Hide details' : 'Show details'}</button>
                    </div>
                    {explanation[listing.id] && <div className="external-match-reason"><b>AI explanation</b><SafeMarkdown>{explanation[listing.id]}</SafeMarkdown><small>This is guidance based on the issue text and student context, not a maintainer requirement.</small></div>}
                    {detailsId === listing.id && <div className="external-project-details">
                      <b>Original GitHub issue</b>
                      <SafeMarkdown>{listing.description || 'No description was supplied by GitHub.'}</SafeMarkdown>
                      <small>Repository: {listing.repository || 'Unavailable'} · Labels: {listing.skills.join(', ') || 'Unavailable'} · Updated: {listing.updatedAt ? new Date(listing.updatedAt).toLocaleString() : 'Unavailable'}</small>
                      <a className="outline" href={listing.sourceUrl} target="_blank" rel="noopener noreferrer">Open unmodified GitHub page <ExternalLink size={14}/></a>
                    </div>}
                  </article>;
                })}
              </div>
              {data.hasMore && <div className="project-card-actions"><button className="outline" disabled={loading} onClick={() => setPage((current) => current + 1)}>Load more</button></div>}
            </>}
  </section>;
}

export function StudentProjectCatalogue({ careerGoal, onSelectProject }: {
  careerGoal: string;
  onSelectProject: (projectId: string) => void;
}) {
  const { data: projects, loading, error, refresh } = useProjectData<Project>('/api/projects');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All categories');
  const [skill, setSkill] = useState('');
  const [difficulty, setDifficulty] = useState('All difficulties');
  const [projectType, setProjectType] = useState('All types');
  const [sort, setSort] = useState('recent');
  const [busyProject, setBusyProject] = useState('');
  const [message, setMessage] = useState('');
  const router = useRouter();

  const types = useMemo(() => [...new Set(projects.map((project) => project.project_type).filter(Boolean))].sort(), [projects]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const skills = skill.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
    const result = projects.filter((project) => {
      const searchable = [
        project.title,
        project.problem_statement,
        project.scope,
        project.deliverables,
        project.category,
        project.project_type,
        project.organization_name,
        ...project.required_skills,
      ].join(' ').toLowerCase();
      return (!query || searchable.includes(query))
        && (category === 'All categories' || project.category === category)
        && (difficulty === 'All difficulties' || project.difficulty === difficulty)
        && (projectType === 'All types' || project.project_type === projectType)
        && (!skills.length || skills.every((requested) =>
          project.required_skills.some((item) => item.toLowerCase().includes(requested))));
    });

    return result.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'duration') return (a.estimated_duration_days ?? Number.MAX_SAFE_INTEGER)
        - (b.estimated_duration_days ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'deadline') return (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [projects, search, category, skill, difficulty, projectType, sort]);

  async function startProject(project: Project) {
    setBusyProject(project.id);
    setMessage('');
    onSelectProject(project.id);
    try {
      await projectApi(`/api/projects/${project.id}/assignments`, { method: 'POST', body: {} });
      setMessage(`“${project.title}” is now in My Projects.`);
      refresh();
      router.push(`/projects/${project.id}`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Project could not be started.');
      refresh();
    } finally {
      setBusyProject('');
    }
  }

  return (
    <section className="project-marketplace">
      <div className="section-title">
        <div><h2>BuildBridge Projects</h2><p className="muted">Verified company assignments and BuildBridge practice projects available to your account.</p></div>
        <span className="pill blue">{filtered.length} {filtered.length === 1 ? 'project' : 'projects'}</span>
      </div>
      <div className="project-filters" role="search">
        <label className="project-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, scope, organization…"/></label>
        <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{PROJECT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Required skill<input value={skill} onChange={(event) => setSkill(event.target.value)} placeholder="e.g. SQL, React"/></label>
        <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All difficulties</option>{['Beginner','Intermediate','Advanced'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Project type<select value={projectType} onChange={(event) => setProjectType(event.target.value)}><option>All types</option>{types.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently published</option><option value="title">Title</option><option value="duration">Shortest duration</option><option value="deadline">Nearest deadline</option></select></label>
      </div>

      {message && <div className="notice" role="status">{message}</div>}
      {loading ? <div className="project-skeletons" aria-label="Loading projects" aria-busy="true"><i/><i/><i/></div>
        : error ? <div className="project-error" role="alert"><p>{error}</p><button className="outline" onClick={refresh}>Retry</button></div>
          : filtered.length === 0 ? <div className="empty-state"><FolderKanban size={40}/><h3>{projects.length ? 'No BuildBridge projects match these filters' : 'No BuildBridge company projects have been published yet'}</h3><p>{projects.length ? 'Adjust your search or filters to see other published projects.' : 'Verified company assignments and BuildBridge Practice Projects will appear here when published. Live external projects are listed below.'}</p></div>
            : <div className="project-catalogue-grid">{filtered.map((project) => <article className="marketplace-project-card" key={project.id}>
              <div className="marketplace-card-heading"><ProjectSource project={project}/><span className="pill green">{project.status}</span></div>
              <h3>{project.title}</h3>
              <p className="project-organization">{project.organization_name}</p>
              <p className="project-problem">{project.problem_statement}</p>
              <div className="project-card-facts"><span>{project.category}</span><span>{project.difficulty}</span><span>{project.project_type}</span></div>
              <div className="project-skills">{project.required_skills.map((item) => <span key={item}>{item}</span>)}</div>
              <p><b>Scope:</b> {project.scope}</p>
              <p><b>Deliverables:</b> {project.deliverables || 'Not specified'}</p>
              <div className="project-card-meta"><span>Duration: {project.estimated_duration_days ? `${project.estimated_duration_days} days` : 'Not specified'}</span><span>Deadline: {project.deadline || 'Not specified'}</span></div>
              <p className="project-compensation"><b>Compensation:</b> {project.project_source === 'practice' ? 'Practice project; no compensation' : project.payment_terms || 'Not stated by publisher'}</p>
              <div className="project-card-actions"><Link className="outline" href={`/projects/${project.id}`} onClick={() => onSelectProject(project.id)}>Project details</Link><button className="primary" disabled={busyProject === project.id} onClick={() => void startProject(project)}>{busyProject === project.id ? 'Starting…' : 'Start project'}</button></div>
            </article>)}</div>}

      <OnlineProjectDiscovery careerGoal={careerGoal}/>

      <section className="external-project-links">
        <div className="section-title"><div><h2>External Opportunities</h2><p className="muted">Internships and freelance work are separate from open-source contributions and BuildBridge assignments.</p></div></div>
        <div className="external-link-grid">
          <a href={`https://internshala.com/internships/${encodeURIComponent(careerGoal)}/`} target="_blank" rel="noopener noreferrer"><b>Internships</b><span>Open an authorized provider search for {careerGoal}. BuildBridge does not copy or verify listings.</span><small>External resource · unpaid or paid status depends on the publisher <ExternalLink size={14}/></small></a>
          <a href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(careerGoal)}&f_E=1`} target="_blank" rel="noopener noreferrer"><b>Freelance and entry-level work</b><span>Search an external professional platform for relevant work.</span><small>External resource · eligibility and compensation are publisher-defined <ExternalLink size={14}/></small></a>
          <a href="https://www.kaggle.com/competitions" target="_blank" rel="noopener noreferrer"><b>Project challenges and competitions</b><span>Browse Kaggle competitions using its official live website.</span><small>External resource · no listings are simulated or auto-entered <ExternalLink size={14}/></small></a>
        </div>
      </section>
    </section>
  );
}

function MilestoneEvidence({ assignment, milestone, onSubmitted }: {
  assignment: Assignment;
  milestone: Project['project_milestones'][number];
  onSubmitted: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reflection, setReflection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const progress = assignment.milestone_progress.find((item) => item.milestone_id === milestone.id);
  const history = assignment.submissions.filter((item) => item.milestone_id === milestone.id);
  const canSubmit = !progress || progress.status === 'not_started' || progress.status === 'in_progress' || progress.status === 'revision_requested';

  async function submitEvidence() {
    if (!file) return setError('Choose an evidence file first.');
    if (file.size > 10 * 1024 * 1024) return setError('Evidence files must be 10 MB or smaller.');
    const supabase = createClient();
    if (!supabase) return setError('Supabase is not configured.');
    setBusy(true);
    setError('');
    let storagePath = '';
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Your session has expired. Sign in again.');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      storagePath = `${user.id}/${assignment.project.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('project-evidence')
        .upload(storagePath, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
      if (uploadError) throw uploadError;

      await projectApi('/api/backend', {
        method: 'POST',
        body: {
          action: 'submit_evidence',
          projectId: assignment.project.id,
          assignmentId: assignment.id,
          milestoneId: milestone.id,
          evidence: { storagePath, fileName: file.name, contentType: file.type, size: file.size },
          reflection,
        },
      });
      setFile(null);
      setReflection('');
      onSubmitted();
    } catch (cause) {
      let detail = cause instanceof Error ? cause.message : 'Evidence could not be submitted.';
      if (storagePath) {
        const { error: cleanupError } = await supabase.storage.from('project-evidence').remove([storagePath]);
        if (cleanupError) detail += ` The unused upload could not be removed: ${cleanupError.message}`;
      }
      setError(detail);
    } finally {
      setBusy(false);
    }
  }

  return <div className="milestone-evidence">
    <p>{milestone.description}</p><small><b>Acceptance criteria:</b> {milestone.acceptance_criteria}</small>
    {milestone.required_deliverables?.length ? <p><b>Required deliverables:</b> {milestone.required_deliverables.join(', ')}</p> : null}
    {milestone.deadline && <p><b>Milestone deadline:</b> {milestone.deadline}</p>}
    {!milestone.is_required && <p className="muted">Optional milestone</p>}
    {progress && <p className={`milestone-state milestone-state-${progress.status}`}>
      <FileCheck2 size={16}/>{progress.status.replaceAll('_', ' ')}
      {progress.completed_at && ` · ${new Date(progress.completed_at).toLocaleDateString()}`}
    </p>}
    {history.length > 0 && <div className="submission-history">
      <b>Evidence history ({history.length} {history.length === 1 ? 'attempt' : 'attempts'})</b>
      {history.map((submission) => <div className="submission-history-item" key={submission.id}>
        <span>{submission.evidence?.fileName || 'Evidence file'} · {submission.status.replaceAll('_', ' ')} · {new Date(submission.created_at).toLocaleDateString()}</span>
        {submission.company_feedback && <p>Reviewer feedback: {submission.company_feedback}</p>}
      </div>)}
    </div>}
    {canSubmit ? <div className="milestone-submit">
        <label>Evidence file (10 MB max)<input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
        <label>Reflection<textarea value={reflection} onChange={(event) => setReflection(event.target.value)} placeholder="Describe what you completed and how it meets the criteria."/></label>
        {error && <p className="project-error" role="alert">{error}</p>}
        <button className="small-primary" disabled={busy || !file} onClick={() => void submitEvidence()}>{busy ? 'Submitting…' : 'Submit milestone evidence'}</button>
      </div> : null}
  </div>;
}

export function StudentMyProjects() {
  const { data: assignments, loading, error, refresh } = useProjectData<Assignment>('/api/projects?view=my');

  return <section className="project-marketplace">
    <div className="section-title"><div><h2>My Projects</h2><p className="muted">Your persistent assignments, milestone progress, and evidence status.</p></div><span className="pill blue">{assignments.length} assigned</span></div>
    {loading ? <div className="project-skeletons" aria-label="Loading your projects" aria-busy="true"><i/><i/></div>
      : error ? <div className="project-error" role="alert"><p>{error}</p><button className="outline" onClick={refresh}>Retry</button></div>
        : assignments.length === 0 ? <div className="empty-state"><FolderKanban size={40}/><h3>You have not started a project yet</h3><p>Choose a published company or BuildBridge practice project from the catalogue to begin.</p></div>
          : <div className="my-project-list">{assignments.map((assignment) => {
            const milestones = assignment.project.project_milestones || [];
            const requiredMilestones = milestones.filter((milestone) => milestone.is_required !== false);
            const completed = requiredMilestones.filter((milestone) =>
              assignment.milestone_progress.some((item) => item.milestone_id === milestone.id && (item.status === 'approved' || item.status === 'completed'))).length;
            const progress = requiredMilestones.length ? Math.round(completed / requiredMilestones.length * 100) : 0;
            const latestSubmission = assignment.submissions[0];
            return <article className="my-project-card" key={assignment.id}>
              <div className="my-project-heading"><div><ProjectSource project={assignment.project}/><h3>{assignment.project.title}</h3></div><span className="pill blue">{assignment.status.replaceAll('_', ' ')}</span></div>
              <p>{assignment.project.scope}</p>
              <div className="project-card-meta"><span>Started {new Date(assignment.started_at).toLocaleDateString()}</span><span>Deadline: {assignment.project.deadline || 'Not specified'}</span></div>
              <div className="milestone-progress"><div><b>Required milestones</b><span>{completed}/{requiredMilestones.length} complete</span></div><progress value={progress} max="100"/></div>
              {latestSubmission && <div className="submission-status"><b>Latest evidence:</b> {latestSubmission.status.replaceAll('_', ' ')} · {new Date(latestSubmission.created_at).toLocaleDateString()}{latestSubmission.company_feedback && <p>Company feedback: {latestSubmission.company_feedback}</p>}</div>}
              <div className="assignment-milestones">{milestones.map((milestone) => <details key={milestone.id}>
                <summary>Milestone {milestone.sequence_number || milestone.sequence}: {milestone.title}{milestone.is_required === false ? ' · Optional' : ''}</summary>
                <MilestoneEvidence assignment={assignment} milestone={milestone} onSubmitted={refresh}/>
              </details>)}</div>
              <Link className="outline" href={`/projects/${assignment.project.id}`}>View full project brief</Link>
              {assignment.project.project_source === 'practice' && <p className="practice-disclaimer">BuildBridge Practice Project · progress and evidence are learning records, not industry approval or a company-verified credential.</p>}
            </article>;
          })}</div>}
  </section>;
}
