import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';
import { projectRow, validateProjectInput } from '@/lib/project-input';
import { createAdminClient } from '@/lib/supabase/admin';

async function recordProjectAudit(actorId: string, role: string, action: string, projectId: string, outcome: string, metadata: Record<string, unknown> = {}) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    await admin.rpc('record_buildbridge_audit', {
      actor_user_id: actorId,
      actor_role: role,
      action,
      entity_type: 'project',
      entity_id: projectId,
      outcome,
      metadata,
    });
  } catch {
    // Audit telemetry must not replace the project operation result.
  }
}

function withPublisher(projects: any[], companies: any[]) {
  const byId = new Map(companies.map((company) => [company.id, company]));
  const byOwner = new Map(companies.map((company) => [company.owner_user_id, company]));
  return projects.map((project) => {
    const company = byId.get(project.company_id) || byOwner.get(project.company_user_id);
    return {
      ...project,
      organization_name: project.project_source === 'practice'
        ? 'BuildBridge'
        : project.project_source === 'legacy'
          ? 'Legacy record · source not verified'
          : company?.verified
            ? company.name
            : 'Organization verification unavailable',
      company_verified: project.project_source === 'company' && Boolean(company?.verified),
      project_milestones: [...(project.project_milestones || [])].sort(
        (a, b) => (a.sequence_number || a.sequence || 0) - (b.sequence_number || b.sequence || 0),
      ),
    };
  });
}

function withoutPrivateCompanyIds(project: any) {
  const publicProject = { ...project };
  delete publicProject.company_user_id;
  delete publicProject.company_id;
  delete publicProject.published_by;
  return publicProject;
}

export async function GET(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    if (!role) return NextResponse.json({ error: 'Your BuildBridge profile is missing.' }, { status: 409 });
    const url = new URL(req.url);
    const view = url.searchParams.get('view');

    if (view === 'my') {
      if (role !== 'student') return NextResponse.json({ error: 'My Projects is available to student accounts.' }, { status: 403 });
      const { data, error } = await supabase
        .from('project_assignments')
        .select('*, project:projects(*, project_milestones(*)), milestone_progress:project_assignment_milestones(*), submissions(id,status,created_at,milestone_id,company_feedback,company_decision,evidence,reflection,reviewed_at)')
        .eq('student_user_id', user.id)
        .order('started_at', { ascending: false });
      if (error) return NextResponse.json({ error: `Your project assignments could not be loaded: ${error.message}` }, { status: 400 });

      const { data: companies, error: companiesError } = await supabase
        .from('companies')
        .select('id,name,owner_user_id,verified');
      if (companiesError) return NextResponse.json({ error: `Project organizations could not be loaded: ${companiesError.message}` }, { status: 400 });
      const normalizedAssignments = (data || []).map((assignment) => ({
        ...assignment,
        project: Array.isArray(assignment.project) ? assignment.project[0] || null : assignment.project,
      }));
      if (normalizedAssignments.some((assignment) => !assignment.project)) {
        return NextResponse.json({ error: 'One of your assignments references a project that is not available.' }, { status: 409 });
      }
      const projectRows = normalizedAssignments.map((assignment) => assignment.project).filter(Boolean);
      const projects = withPublisher(projectRows, companies || []);
      const projectsById = new Map(projects.map((project) => [project.id, project]));
      return NextResponse.json({
        data: normalizedAssignments.map((assignment) => {
          const publicAssignment = { ...assignment };
          delete publicAssignment.company_id;
          delete publicAssignment.company_user_id;
          return {
            ...publicAssignment,
            project: withoutPrivateCompanyIds(projectsById.get(assignment.project?.id) || assignment.project),
            milestone_progress: [...(assignment.milestone_progress || [])],
            submissions: [...(assignment.submissions || [])].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            ),
          };
        }),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const query = supabase
      .from('projects')
      .select('*, project_milestones(*)')
      .order('created_at', { ascending: false });
    if (role === 'student') query.eq('status', 'published');
    if (role === 'company_member') query.eq('company_user_id', user.id);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: `Projects could not be loaded: ${error.message}` }, { status: 400 });
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id,name,owner_user_id,verified');
    if (companiesError) return NextResponse.json({ error: `Project organizations could not be loaded: ${companiesError.message}` }, { status: 400 });
    const projects = withPublisher(data || [], companies || []);
    for (const project of projects) {
      project.project_milestones = [...project.project_milestones].sort(
        (a, b) => (a.sequence_number || a.sequence || 0) - (b.sequence_number || b.sequence || 0),
      );
    }
    return NextResponse.json({
      data: role === 'student' ? projects.map(withoutPrivateCompanyIds) : projects,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project request failed.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    if (role !== 'company_member' && role !== 'admin') {
      return NextResponse.json({ error: 'Only verified companies or platform admins can publish project records.' }, { status: 403 });
    }
    const body = await req.json() as Record<string, unknown>;
    const validation = validateProjectInput(body);
    if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 });

    const isPractice = role === 'admin';
    let company: { id: string; name: string; verified: boolean } | null = null;
    if (!isPractice) {
      const { data, error } = await supabase
        .from('companies')
        .select('id,name,verified')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: `Company verification could not be checked: ${error.message}` }, { status: 400 });
      if (!data?.verified) return NextResponse.json({ error: 'An administrator must verify your organization before you can create projects.' }, { status: 403 });
      company = data;
    }

    const inputRow = projectRow(validation.data);
    const slugBase = validation.data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
    const slug = isPractice ? `${slugBase || 'practice-project'}-${crypto.randomUUID().slice(0, 8)}` : null;
    const { data: project, error: insertError } = await supabase
      .from('projects')
      .insert({
        ...inputRow,
        company_user_id: isPractice ? null : user.id,
        company_id: company?.id || null,
        project_source: isPractice ? 'practice' : 'company',
        is_industry: !isPractice,
        publisher_label: isPractice ? 'BuildBridge' : null,
        published_by: isPractice ? user.id : null,
        slug,
        payment_terms: isPractice ? null : inputRow.payment_terms,
        status: 'draft',
      })
      .select('*')
      .single();
    if (insertError) return NextResponse.json({ error: `Project draft could not be created: ${insertError.message}` }, { status: 400 });

    const milestones = validation.data.milestones.map((milestone, index) => ({
      project_id: project.id,
      sequence: index + 1,
      sequence_number: index + 1,
      title: milestone.title,
      description: milestone.description,
      acceptance_criteria: milestone.acceptanceCriteria,
      required_deliverables: milestone.requiredDeliverables,
      deadline: milestone.deadline || validation.data.deadline,
      is_required: milestone.isRequired,
    }));
    const { error: milestoneError } = await supabase.from('project_milestones').insert(milestones);
    if (milestoneError) {
      return NextResponse.json({
        error: `The project draft was created (${project.id}), but its milestones could not be saved: ${milestoneError.message}. Reopen the draft to complete it.`,
      }, { status: 500 });
    }

    await recordProjectAudit(user.id, role, 'project_draft_created', project.id, 'success', {
      project_source: isPractice ? 'practice' : 'company',
      milestone_count: milestones.length,
    });
    return NextResponse.json({ data: { ...project, project_milestones: milestones } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project could not be created.' }, { status: 500 });
  }
}
