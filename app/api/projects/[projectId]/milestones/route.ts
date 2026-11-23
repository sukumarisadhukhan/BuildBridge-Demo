import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ projectId: string }> };

function text(value: unknown, maximum: number) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length > 0 && result.length <= maximum ? result : null;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    const { projectId } = await params;
    const body = await req.json() as Record<string, unknown>;

    const title = text(body.title, 160);
    const description = text(body.description, 1000);
    const acceptanceCriteria = text(body.acceptanceCriteria, 1000);
    const rawDeliverables = body.requiredDeliverables === undefined ? [] : body.requiredDeliverables;
    if (!title || !description || !acceptanceCriteria || !Array.isArray(rawDeliverables)
      || rawDeliverables.length > 20
      || rawDeliverables.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 200)
      || (body.deadline !== undefined && body.deadline !== null && body.deadline !== '' && !validDate(body.deadline))
      || (body.isRequired !== undefined && typeof body.isRequired !== 'boolean')
    ) {
      return NextResponse.json({ error: 'Provide a title, description, acceptance criteria, valid deliverables, and valid deadline.' }, { status: 400 });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id,company_id,company_user_id,project_source,is_industry,status,deadline')
      .eq('id', projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: `Project could not be checked: ${projectError.message}` }, { status: 400 });
    if (!project) return NextResponse.json({ error: 'Project not found or unavailable.' }, { status: 404 });

    if (project.status !== 'published' && project.status !== 'in_progress') {
      return NextResponse.json({ error: 'Milestones can be appended only to published or active projects.' }, { status: 409 });
    }

    if (role === 'company_member') {
      if (project.project_source !== 'company' || !project.is_industry || project.company_user_id !== user.id) {
        return NextResponse.json({ error: 'You can only append milestones to your organization’s verified projects.' }, { status: 403 });
      }
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id,verified')
        .eq('id', project.company_id)
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (companyError) return NextResponse.json({ error: `Company authorization could not be checked: ${companyError.message}` }, { status: 400 });
      if (!company?.verified) return NextResponse.json({ error: 'Only the verified assigning company can append milestones.' }, { status: 403 });
    } else if (role !== 'admin' || project.project_source !== 'practice') {
      return NextResponse.json({ error: 'Only the project publisher can append milestones.' }, { status: 403 });
    }

    const { data: completedAssignments, error: completionError } = await supabase
      .from('project_assignments')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['approved', 'completed'])
      .limit(1);
    if (completionError) return NextResponse.json({ error: `Assignment completion state could not be checked: ${completionError.message}` }, { status: 400 });
    if (completedAssignments?.length) {
      return NextResponse.json({ error: 'Milestones cannot be appended after a student assignment has been completed.' }, { status: 409 });
    }

    const { data: latest, error: sequenceError } = await supabase
      .from('project_milestones')
      .select('sequence,sequence_number')
      .eq('project_id', projectId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sequenceError) return NextResponse.json({ error: `Existing milestone order could not be checked: ${sequenceError.message}` }, { status: 400 });
    const sequence = Math.max(latest?.sequence || 0, latest?.sequence_number || 0) + 1;
    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id: projectId,
        sequence,
        sequence_number: sequence,
        title,
        description,
        acceptance_criteria: acceptanceCriteria,
        required_deliverables: rawDeliverables.map((item) => (item as string).trim()),
        deadline: body.deadline || project.deadline,
        is_required: body.isRequired !== false,
      })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: `Milestone could not be appended: ${error.message}` }, { status: 400 });
    return NextResponse.json({ data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Milestone could not be appended.' }, { status: 500 });
  }
}
