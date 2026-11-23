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
    // Audit telemetry must not replace project mutation results.
  }
}

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { projectId } = await params;
    const { data: project, error } = await auth.supabase
      .from('projects')
      .select('*, project_milestones(*)')
      .eq('id', projectId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Project details could not be loaded: ${error.message}` }, { status: 400 });
    if (!project) return NextResponse.json({ error: 'Project not found or is not available to your account.' }, { status: 404 });

    const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
    const { data: assignment, error: assignmentError } = role === 'student'
      ? await auth.supabase
        .from('project_assignments')
        .select('id,status')
        .eq('project_id', projectId)
        .eq('student_user_id', auth.user.id)
        .maybeSingle()
      : { data: null, error: null };
    if (assignmentError) return NextResponse.json({ error: `Project assignment could not be loaded: ${assignmentError.message}` }, { status: 400 });

    let organizationName = project.project_source === 'practice'
      ? 'BuildBridge'
      : 'Legacy record · source not verified';
    let companyVerified = false;
    if (project.project_source === 'company') {
      let companyQuery = auth.supabase.from('companies').select('name,verified');
      companyQuery = project.company_id
        ? companyQuery.eq('id', project.company_id)
        : companyQuery.eq('owner_user_id', project.company_user_id);
      const { data: company, error: companyError } = await companyQuery.maybeSingle();
      if (companyError) return NextResponse.json({ error: `Project organization could not be loaded: ${companyError.message}` }, { status: 400 });
      companyVerified = Boolean(company?.verified);
      if (!companyVerified && !(role === 'student' && assignment)) {
        return NextResponse.json({ error: 'This company project is not currently verified.' }, { status: 404 });
      }
      organizationName = companyVerified ? company?.name || 'Verified organization' : 'Organization verification unavailable';
    }

    const responseProject = {
      ...project,
      organization_name: organizationName,
      company_verified: companyVerified,
      project_milestones: [...(project.project_milestones || [])].sort((a, b) => a.sequence - b.sequence),
      assignment: assignment || null,
      current_user_role: role,
    };
    if (role === 'student') {
      delete responseProject.company_user_id;
      delete responseProject.company_id;
      delete responseProject.published_by;
    }
    return NextResponse.json({ data: responseProject }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project request failed.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;
    const { data: project, error: readError } = await supabase
      .from('projects')
      .select('id,company_user_id,project_source,status')
      .eq('id', projectId)
      .maybeSingle();
    if (readError) return NextResponse.json({ error: `Project could not be checked: ${readError.message}` }, { status: 400 });
    if (!project) return NextResponse.json({ error: 'Project not found or is not available to your account.' }, { status: 404 });

    if (role === 'company_member') {
      if (project.company_user_id !== user.id || project.project_source !== 'company') {
        return NextResponse.json({ error: 'You can only edit projects owned by your verified organization.' }, { status: 403 });
      }
    } else if (role === 'admin') {
      if (project.project_source !== 'practice') {
        return NextResponse.json({ error: 'Admin publishing controls are limited to BuildBridge Practice Projects.' }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: 'Only the project publisher can edit or publish this project.' }, { status: 403 });
    }

    const status = body.status;
    if (status !== undefined && status !== 'draft' && status !== 'published') {
      return NextResponse.json({ error: 'Project status must be draft or published.' }, { status: 400 });
    }

    const contentKeys = [
      'title', 'problemStatement', 'scope', 'deliverables', 'acceptanceCriteria', 'category',
      'difficulty', 'projectType', 'requiredSkills', 'estimatedDurationDays', 'deadline',
      'revisionPolicy', 'paymentTerms', 'requirements', 'submissionFormat', 'resources',
      'evaluationRubric', 'milestones',
    ];
    const hasContentUpdate = contentKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
    let fields: ReturnType<typeof projectRow> | null = null;
    let milestoneInputs: Array<{
      title: string;
      description: string;
      acceptanceCriteria: string;
      requiredDeliverables: string[];
      deadline: string | null;
      isRequired: boolean;
    }> | null = null;
    if (hasContentUpdate) {
      const validation = validateProjectInput(body);
      if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: 400 });
      fields = projectRow(validation.data);
      milestoneInputs = validation.data.milestones;
      if (role === 'admin') fields.payment_terms = null;
      const { count, error: assignmentError } = await supabase
        .from('project_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      if (assignmentError) return NextResponse.json({ error: `Project assignments could not be checked: ${assignmentError.message}` }, { status: 400 });
      if ((count || 0) > 0) {
        return NextResponse.json({ error: 'This project already has student assignments. Its requirements and milestones are locked to protect active work.' }, { status: 409 });
      }
    } else if (status === undefined) {
      return NextResponse.json({ error: 'Provide project details or a draft/publish status.' }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields) Object.assign(update, fields);
    if (status !== undefined) {
      update.status = status;
      if (role === 'admin' && status === 'published') update.published_by = user.id;
    }
    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update(update)
      .eq('id', projectId)
      .select('*')
      .single();
    if (updateError) return NextResponse.json({ error: `Project could not be saved: ${updateError.message}` }, { status: 400 });

    if (fields) {
      const { error: deleteError } = await supabase.from('project_milestones').delete().eq('project_id', projectId);
      if (deleteError) {
        return NextResponse.json({ error: `Project details were saved, but old milestones could not be replaced: ${deleteError.message}` }, { status: 500 });
      }
      const milestones = (milestoneInputs || []).map((milestone, index) => ({
        project_id: projectId,
        sequence: index + 1,
        sequence_number: index + 1,
        title: milestone.title,
        description: milestone.description,
        acceptance_criteria: milestone.acceptanceCriteria,
        required_deliverables: milestone.requiredDeliverables,
        deadline: milestone.deadline || fields?.deadline || null,
        is_required: milestone.isRequired,
      }));
      const { error: milestoneError } = await supabase.from('project_milestones').insert(milestones);
      if (milestoneError) {
        return NextResponse.json({ error: `Project details were saved, but milestones could not be replaced: ${milestoneError.message}` }, { status: 500 });
      }
      await recordProjectAudit(user.id, role || 'unknown', status === 'published' ? 'project_published' : 'project_updated', projectId, 'success', { status: status || 'draft', milestone_count: milestones.length });
      return NextResponse.json({ data: { ...updated, project_milestones: milestones } });
    }
    await recordProjectAudit(user.id, role || 'unknown', status === 'published' ? 'project_published' : 'project_status_updated', projectId, 'success', { status: status || 'unchanged' });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project could not be updated.' }, { status: 500 });
  }
}
