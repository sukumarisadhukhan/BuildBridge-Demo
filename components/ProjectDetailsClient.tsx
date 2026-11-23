'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ExternalLink, FolderKanban, ListChecks } from 'lucide-react';
import { projectApi } from '@/lib/project-api-client';

type ProjectDetails = {
  id: string;
  title: string;
  problem_statement: string;
  scope: string;
  deliverables: string | null;
  acceptance_criteria: string | null;
  requirements: string[];
  submission_format: string;
  resources: Array<{ label: string; url: string }>;
  evaluation_rubric: Array<{ criterion: string; weight: number }>;
  required_skills: string[];
  category: string;
  difficulty: string;
  project_type: string;
  estimated_duration_days: number | null;
  deadline: string | null;
  payment_terms: string | null;
  revision_policy: string | null;
  status: string;
  project_source: 'company' | 'practice' | 'legacy';
  organization_name: string;
  company_verified: boolean;
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
  assignment: { id: string; status: string } | null;
  current_user_role: string;
};

export default function ProjectDetailsClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setProject(await projectApi<ProjectDetails>(`/api/projects/${projectId}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project details could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  async function startProject() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await projectApi(`/api/projects/${projectId}/assignments`, { method: 'POST', body: {} });
      setMessage('Project started and saved to your assignments.');
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Project could not be started.');
      setReloadKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="project-details-shell"><div className="project-skeletons" aria-label="Loading project details" aria-busy="true"><i/><i/></div></main>;
  if (error && !project) return <main className="project-details-shell"><div className="project-error" role="alert"><p>{error}</p><button className="outline" onClick={() => setReloadKey((key) => key + 1)}>Retry</button><Link className="outline" href="/workspace">Back to workspace</Link></div></main>;
  if (!project) return null;

  const isPractice = project.project_source === 'practice';
  const sourceLabel = isPractice
    ? 'BuildBridge Practice Project'
    : project.project_source === 'company'
      ? `${project.company_verified ? 'Verified Company Project' : 'Company Project · verification unavailable'} · ${project.organization_name}`
      : 'Legacy project · source not verified';
  return <main className="project-details-shell">
    <header className="project-details-top"><Link href="/workspace"><ArrowLeft size={17}/> BuildBridge</Link><span className={`project-source ${isPractice ? 'practice-source' : 'company-source'}`}>{sourceLabel}</span></header>
    <section className="project-details-hero">
      <div className="project-detail-tags"><span className="pill green">{project.status}</span><span className="pill blue">{project.category}</span><span className="pill purple">{project.difficulty}</span><span className="pill">{project.project_type}</span></div>
      <h1>{project.title}</h1>
      <p className="project-organization">{project.organization_name}</p>
      <p className="project-problem">{project.problem_statement}</p>
      <div className="project-card-meta"><span>Estimated duration: {project.estimated_duration_days ? `${project.estimated_duration_days} days` : 'Not specified'}</span><span>Deadline: {project.deadline || 'Not specified'}</span><span>Compensation: {isPractice ? 'Practice project; no compensation' : project.payment_terms || 'Not stated by publisher'}</span></div>
      {project.current_user_role === 'student' && <div className="project-detail-actions">
        {project.assignment
          ? <><span className="pill blue">In My Projects · {project.assignment.status.replaceAll('_', ' ')}</span><button className="primary" onClick={() => router.push('/workspace?screen=My%20Projects')}>Continue in My Projects</button></>
          : <button className="primary" disabled={busy || project.status !== 'published'} onClick={() => void startProject()}>{busy ? 'Starting…' : 'Start project'}</button>}
      </div>}
      {message && <div className="notice" role="status">{message}</div>}
      {error && <div className="project-error" role="alert">{error}</div>}
    </section>

    <div className="project-details-grid">
      <div className="project-details-main">
        <section className="panel"><h2>Project scope</h2><p>{project.scope}</p></section>
        <section className="panel"><h2>Deliverables</h2><p>{project.deliverables || 'Not specified by publisher.'}</p></section>
        <section className="panel"><h2>Requirements</h2>{project.requirements.length ? <ul>{project.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul> : <p>No additional requirements supplied.</p>}</section>
        <section className="panel"><h2>Acceptance criteria</h2><p>{project.acceptance_criteria || 'Not specified by publisher.'}</p><p><b>Submission format:</b> {project.submission_format || 'Not specified'}</p>{project.revision_policy && <p><b>Revision policy:</b> {project.revision_policy}</p>}</section>
        <section className="panel"><h2><ListChecks size={19}/> Milestones</h2><div className="detail-milestones">{project.project_milestones.map((milestone) => <article key={milestone.id}><span>{milestone.sequence_number || milestone.sequence}</span><div><h3>{milestone.title}{milestone.is_required === false ? ' · Optional' : ''}</h3><p>{milestone.description}</p><small><b>Acceptance criteria:</b> {milestone.acceptance_criteria}</small>{milestone.required_deliverables?.length ? <small><b>Required deliverables:</b> {milestone.required_deliverables.join(', ')}</small> : null}{milestone.deadline && <small><b>Deadline:</b> {milestone.deadline}</small>}</div></article>)}</div></section>
      </div>
      <aside className="project-details-aside">
        <section className="panel"><h2>Required skills</h2><div className="project-skills">{project.required_skills.map((skill) => <span key={skill}>{skill}</span>)}</div></section>
        <section className="panel"><h2>Evaluation rubric</h2><div className="rubric-list">{project.evaluation_rubric.map((item) => <div key={item.criterion}><span>{item.criterion}</span><b>{item.weight}%</b></div>)}</div></section>
        <section className="panel"><h2>Resources</h2>{project.resources.length ? project.resources.map((resource) => <a className="project-resource-link" href={resource.url} target="_blank" rel="noopener noreferrer" key={`${resource.label}-${resource.url}`}>{resource.label}<ExternalLink size={14}/></a>) : <p>No additional resources supplied.</p>}</section>
        {isPractice && <section className="project-practice-note"><FolderKanban/><b>Practice project</b><p>This BuildBridge-published brief supports learning and evidence submission. It is not employer-assigned work and cannot produce an industry-verified approval.</p></section>}
      </aside>
    </div>
  </main>;
}
