'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus, Save } from 'lucide-react';
import { PROJECT_CATEGORIES, type ProjectMilestoneInput } from '@/lib/project-input';
import { projectApi } from '@/lib/project-api-client';
import { createClient } from '@/lib/supabase';

type ManagedProject = {
  id: string;
  company_user_id: string | null;
  project_source: 'company' | 'practice' | 'legacy';
  company_verified: boolean;
  status: string;
  title: string;
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
  revision_policy: string | null;
  requirements: string[];
  submission_format: string;
  resources: Array<{ label: string; url: string }>;
  evaluation_rubric: Array<{ criterion: string; weight: number }>;
  project_milestones: Array<{
    title: string;
    description: string;
    acceptance_criteria: string;
    required_deliverables?: string[];
    deadline?: string | null;
    is_required?: boolean;
  }>;
  organization_name: string;
};

type FormState = {
  title: string;
  problemStatement: string;
  scope: string;
  deliverables: string;
  acceptanceCriteria: string;
  category: string;
  difficulty: string;
  projectType: string;
  requiredSkills: string;
  durationDays: string;
  deadline: string;
  revisionPolicy: string;
  paymentTerms: string;
  requirements: string;
  submissionFormat: string;
  resources: string;
  evaluationRubric: string;
  milestones: string;
};

const blankForm: FormState = {
  title: '',
  problemStatement: '',
  scope: '',
  deliverables: '',
  acceptanceCriteria: '',
  category: PROJECT_CATEGORIES[0],
  difficulty: 'Beginner',
  projectType: 'Portfolio project',
  requiredSkills: '',
  durationDays: '',
  deadline: '',
  revisionPolicy: '',
  paymentTerms: '',
  requirements: '',
  submissionFormat: '',
  resources: '',
  evaluationRubric: 'Functionality | 40\nEvidence and reasoning | 35\nDocumentation | 25',
  milestones: 'Plan the work | Define the approach and success criteria | Submit a concise plan\nBuild the deliverables | Complete the scoped work and validate it | Deliverables meet the stated requirements',
};

function parseLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function formFromProject(project: ManagedProject): FormState {
  return {
    title: project.title,
    problemStatement: project.problem_statement || '',
    scope: project.scope || '',
    deliverables: project.deliverables || '',
    acceptanceCriteria: project.acceptance_criteria || '',
    category: project.category,
    difficulty: project.difficulty,
    projectType: project.project_type,
    requiredSkills: (project.required_skills || []).join(', '),
    durationDays: project.estimated_duration_days?.toString() || '',
    deadline: project.deadline || '',
    revisionPolicy: project.revision_policy || '',
    paymentTerms: project.payment_terms || '',
    requirements: (project.requirements || []).join('\n'),
    submissionFormat: project.submission_format || '',
    resources: (project.resources || []).map((item) => `${item.label} | ${item.url}`).join('\n'),
    evaluationRubric: (project.evaluation_rubric || []).map((item) => `${item.criterion} | ${item.weight}`).join('\n'),
    milestones: (project.project_milestones || []).map((item) =>
      `${item.title} | ${item.description} | ${item.acceptance_criteria} | ${(item.required_deliverables || []).join(', ')} | ${item.deadline || ''} | ${item.is_required === false ? 'optional' : 'required'}`,
    ).join('\n'),
  };
}

function payloadFromForm(form: FormState) {
  const parsed = (value: string) => parseLines(value).map((line) => line.split('|').map((item) => item.trim()));
  return {
    title: form.title,
    problemStatement: form.problemStatement,
    scope: form.scope,
    deliverables: form.deliverables,
    acceptanceCriteria: form.acceptanceCriteria,
    category: form.category,
    difficulty: form.difficulty,
    projectType: form.projectType,
    requiredSkills: form.requiredSkills.split(',').map((item) => item.trim()).filter(Boolean),
    estimatedDurationDays: form.durationDays ? Number(form.durationDays) : null,
    deadline: form.deadline || null,
    revisionPolicy: form.revisionPolicy,
    paymentTerms: form.paymentTerms,
    requirements: parseLines(form.requirements),
    submissionFormat: form.submissionFormat,
    resources: parsed(form.resources).map((parts) => ({ label: parts[0] || '', url: parts[1] || '' })),
    evaluationRubric: parsed(form.evaluationRubric).map((parts) => ({ criterion: parts[0] || '', weight: Number(parts[1]) })),
    milestones: parsed(form.milestones).map((parts): ProjectMilestoneInput => {
      const requiredState = (parts[5] || 'required').toLowerCase();
      if (requiredState !== 'required' && requiredState !== 'optional') {
        throw new Error('Milestone state must be “required” or “optional”.');
      }
      return {
        title: parts[0] || '',
        description: parts[1] || '',
        acceptanceCriteria: parts[2] || '',
        requiredDeliverables: (parts[3] || '').split(',').map((item) => item.trim()).filter(Boolean),
        deadline: parts[4] || form.deadline || null,
        isRequired: requiredState === 'required',
      };
    }),
  };
}

export function ProjectManagement({ mode, verified = false, onRefresh }: {
  mode: 'company' | 'admin';
  verified?: boolean;
  onRefresh?: () => void;
}) {
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [form, setForm] = useState<FormState>(blankForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [appendProjectId, setAppendProjectId] = useState('');
  const [appendMilestone, setAppendMilestone] = useState({
    title: '',
    description: '',
    acceptanceCriteria: '',
    requiredDeliverables: '',
    deadline: '',
    isRequired: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await projectApi<ManagedProject[]>('/api/projects');
      setProjects(result);
      const supabase = createClient();
      if (!supabase) throw new Error('Supabase is not configured for this application.');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw new Error(`Account details could not be loaded: ${userError.message}`);
      setOwnerId(user?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project records could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const visibleProjects = mode === 'company'
    ? projects.filter((project) => project.project_source === 'company' && project.company_user_id === ownerId)
    : projects;

  function startEditing(project: ManagedProject) {
    if (mode === 'company' && project.company_user_id !== ownerId) return;
    if (mode === 'admin' && project.project_source !== 'practice') return;
    setEditingId(project.id);
    setForm(formFromProject(project));
    setMessage('');
    document.getElementById('project-editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (mode === 'company' && !verified) {
      setError('An administrator must verify your organization before project drafts can be created.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = payloadFromForm(form);
      if (editingId) {
        await projectApi(`/api/projects/${editingId}`, { method: 'PATCH', body });
        setMessage('Project changes saved.');
      } else {
        const project = await projectApi<ManagedProject>('/api/projects', { method: 'POST', body });
        setEditingId(project.id);
        setMessage(mode === 'admin'
          ? 'BuildBridge Practice Project draft saved. Publish it when the brief is ready.'
          : 'Project draft saved. Publish it when the brief is ready.');
      }
      setRefreshKey((key) => key + 1);
      onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project could not be saved.');
      setRefreshKey((key) => key + 1);
      onRefresh?.();
    } finally {
      setBusy(false);
    }
  }

  async function publish(project: ManagedProject) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await projectApi(`/api/projects/${project.id}`, { method: 'PATCH', body: { status: 'published' } });
      setMessage(project.project_source === 'practice'
        ? 'BuildBridge Practice Project published.'
        : 'Project published for students. It is labelled as a verified company project.');
      setRefreshKey((key) => key + 1);
      onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project could not be published.');
    } finally {
      setBusy(false);
    }
  }

  async function appendProjectMilestone(event: React.FormEvent, projectId: string) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await projectApi(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        body: {
          ...appendMilestone,
          requiredDeliverables: appendMilestone.requiredDeliverables.split(',').map((item) => item.trim()).filter(Boolean),
          deadline: appendMilestone.deadline || null,
        },
      });
      setMessage('Milestone appended. Existing milestone history and submissions were preserved.');
      setAppendProjectId('');
      setAppendMilestone({ title: '', description: '', acceptanceCriteria: '', requiredDeliverables: '', deadline: '', isRequired: true });
      setRefreshKey((key) => key + 1);
      onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Milestone could not be appended.');
    } finally {
      setBusy(false);
    }
  }

  function cancelEdit() {
    setEditingId('');
    setForm(blankForm);
    setMessage('');
    setError('');
  }

  return <section className="project-management">
    <div className="section-title"><div><h2>{mode === 'admin' ? 'Project moderation and practice publishing' : 'Create and manage projects'}</h2><p className="muted">{mode === 'admin' ? 'Publish original BuildBridge Practice Projects. Company projects remain managed by their verified publishers.' : 'Create, edit, and publish projects for students.'}</p></div></div>
    {mode === 'company' && !verified && <div className="project-warning" role="status">Your organization must be verified by an administrator before you can create or publish projects.</div>}
    {error && <div className="project-error" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}

    <form className="panel form-panel project-editor" id="project-editor" onSubmit={(event) => void saveDraft(event)}>
      <div className="project-editor-heading"><div><h3>{editingId ? 'Edit project brief' : mode === 'admin' ? 'Create a BuildBridge Practice Project' : 'Create a company project'}</h3><p className="muted">Required fields are validated before the draft is saved. Student assignments lock the published brief to protect active work.</p></div>{mode === 'admin' && <span className="project-source practice-source">BuildBridge Practice Project</span>}</div>
      <label>Project title<input required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
      <label>Full problem statement<textarea required value={form.problemStatement} onChange={(event) => setForm({ ...form, problemStatement: event.target.value })}/></label>
      <label>Scope<textarea required value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}/></label>
      <label>Deliverables<textarea required value={form.deliverables} onChange={(event) => setForm({ ...form, deliverables: event.target.value })}/></label>
      <label>Acceptance criteria<textarea required value={form.acceptanceCriteria} onChange={(event) => setForm({ ...form, acceptanceCriteria: event.target.value })}/></label>
      <div className="project-form-grid">
        <label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{PROJECT_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Difficulty<select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })}>{['Beginner','Intermediate','Advanced'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Project type<input required maxLength={60} value={form.projectType} onChange={(event) => setForm({ ...form, projectType: event.target.value })} placeholder="Case study, web app, data analysis…"/></label>
        <label>Estimated duration (days)<input type="number" min="1" max="365" value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: event.target.value })}/></label>
        <label>Required skills, comma-separated<input required value={form.requiredSkills} onChange={(event) => setForm({ ...form, requiredSkills: event.target.value })} placeholder="SQL, Python, data visualization"/></label>
        <label>Deadline<input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })}/></label>
      </div>
      <label>Project requirements, one per line<textarea value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })}/></label>
      <label>Milestones, one per line: title | description | acceptance criteria | comma-separated deliverables | deadline (YYYY-MM-DD or blank) | required/optional<textarea required value={form.milestones} onChange={(event) => setForm({ ...form, milestones: event.target.value })}/></label>
      <label>Submission format<textarea required value={form.submissionFormat} onChange={(event) => setForm({ ...form, submissionFormat: event.target.value })}/></label>
      <label>Evaluation rubric, one per line: criterion | weight (weights must total 100)<textarea required value={form.evaluationRubric} onChange={(event) => setForm({ ...form, evaluationRubric: event.target.value })}/></label>
      <label>Resources, one per line: label | URL<textarea value={form.resources} onChange={(event) => setForm({ ...form, resources: event.target.value })}/></label>
      <label>Revision policy<textarea value={form.revisionPolicy} onChange={(event) => setForm({ ...form, revisionPolicy: event.target.value })}/></label>
      {mode === 'company' && <label>Compensation / payment terms<input value={form.paymentTerms} onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} placeholder="Leave blank if no terms are stated."/></label>}
      {mode === 'admin' && <p className="practice-disclaimer">Practice project submissions are learning evidence only. They are never presented as employer-approved work or used to issue industry certificates.</p>}
      <div className="project-form-actions"><button className="primary" type="submit" disabled={busy || (mode === 'company' && !verified)}><Save size={16}/>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save draft'}</button>{editingId && <button className="outline" type="button" onClick={cancelEdit}>New project</button>}</div>
    </form>

    <div className="panel project-management-list">
      <div className="section-title"><h2>{mode === 'admin' ? 'Published and draft records' : 'Your projects'}</h2><button className="outline" onClick={() => setRefreshKey((key) => key + 1)}>Refresh</button></div>
      {loading ? <div className="project-skeletons" aria-label="Loading project records" aria-busy="true"><i/><i/></div>
        : visibleProjects.length === 0 ? <div className="empty-state"><FileText size={36}/><h3>{mode === 'admin' ? 'No project records' : 'No projects created yet'}</h3><p>{mode === 'admin' ? 'Create an original practice project above, or verified company projects will appear here when available.' : 'Your organization’s saved project briefs will appear here.'}</p></div>
          : visibleProjects.map((project) => <article className="managed-project-row" key={project.id}>
            <div className="managed-project-copy"><div className="tag-row"><span className={`project-source ${project.project_source === 'practice' ? 'practice-source' : 'company-source'}`}>{project.project_source === 'practice' ? 'BuildBridge Practice Project' : project.project_source === 'company' ? `${project.company_verified ? 'Verified Company Project' : 'Company project · organization not currently verified'} · ${project.organization_name}` : 'Legacy project · source not verified'}</span><span className={`pill ${project.status === 'published' ? 'green' : 'blue'}`}>{project.status}</span></div><b>{project.title}</b><small>{project.category} · {project.difficulty} · {project.project_type}</small></div>
            <div className="managed-project-actions">
              {(mode === 'company' && project.project_source === 'company' || mode === 'admin' && project.project_source === 'practice') && <button className="outline" disabled={busy} onClick={() => startEditing(project)}>Edit</button>}
              {project.status !== 'published' && (mode === 'company' && project.project_source === 'company' || mode === 'admin' && project.project_source === 'practice') && <button className="small-primary" disabled={busy || (mode === 'company' && !verified)} onClick={() => void publish(project)}><CheckCircle2 size={15}/>Publish</button>}
              {project.status === 'published' && (mode === 'company' && verified && project.project_source === 'company' && project.company_user_id === ownerId || mode === 'admin' && project.project_source === 'practice') && <button className="outline" disabled={busy} onClick={() => {
                setAppendProjectId(appendProjectId === project.id ? '' : project.id);
                setAppendMilestone({ title: '', description: '', acceptanceCriteria: '', requiredDeliverables: '', deadline: '', isRequired: true });
              }}><Plus size={15}/>Append milestone</button>}
            </div>
            {appendProjectId === project.id && <form className="append-milestone-form" onSubmit={(event) => void appendProjectMilestone(event, project.id)}>
              <h4>Append milestone</h4>
              <label>Title<input required maxLength={160} value={appendMilestone.title} onChange={(event) => setAppendMilestone({ ...appendMilestone, title: event.target.value })}/></label>
              <label>Description<textarea required maxLength={1000} value={appendMilestone.description} onChange={(event) => setAppendMilestone({ ...appendMilestone, description: event.target.value })}/></label>
              <label>Acceptance criteria<textarea required maxLength={1000} value={appendMilestone.acceptanceCriteria} onChange={(event) => setAppendMilestone({ ...appendMilestone, acceptanceCriteria: event.target.value })}/></label>
              <label>Required deliverables, comma-separated<input value={appendMilestone.requiredDeliverables} onChange={(event) => setAppendMilestone({ ...appendMilestone, requiredDeliverables: event.target.value })}/></label>
              <label>Deadline<input type="date" value={appendMilestone.deadline} onChange={(event) => setAppendMilestone({ ...appendMilestone, deadline: event.target.value })}/></label>
              <label className="inline-checkbox"><input type="checkbox" checked={appendMilestone.isRequired} onChange={(event) => setAppendMilestone({ ...appendMilestone, isRequired: event.target.checked })}/> Required for completion</label>
              <button className="small-primary" disabled={busy}>{busy ? 'Appending…' : 'Append milestone'}</button>
            </form>}
          </article>)}
    </div>
  </section>;
}
