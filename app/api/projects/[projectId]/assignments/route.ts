import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ projectId: string }> };

function publicAssignment(assignment: Record<string, unknown>) {
  const result = { ...assignment };
  delete result.company_id;
  delete result.company_user_id;
  delete result.assigned_by;
  return result;
}

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    if (role !== 'student') return NextResponse.json({ error: 'Only student accounts can start a project.' }, { status: 403 });
    const { projectId } = await params;
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id,status')
      .eq('id', projectId)
      .eq('status', 'published')
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: `Project availability could not be checked: ${projectError.message}` }, { status: 400 });
    if (!project) return NextResponse.json({ error: 'This project is not currently available to start.' }, { status: 404 });

    const { data: assignment, error: assignmentError } = await supabase
      .from('project_assignments')
      .insert({ project_id: projectId, student_user_id: user.id })
      .select('id,project_id,student_user_id,status,started_at,updated_at,submitted_at,completed_at')
      .single();
    if (assignmentError?.code === '23505') {
      const { data: existing, error: existingError } = await supabase
        .from('project_assignments')
        .select('id,project_id,student_user_id,status,started_at,updated_at,submitted_at,completed_at')
        .eq('project_id', projectId)
        .eq('student_user_id', user.id)
        .single();
      if (existingError) return NextResponse.json({ error: `Existing project assignment could not be loaded: ${existingError.message}` }, { status: 400 });
      return NextResponse.json({ data: publicAssignment(existing) }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    } else if (assignmentError) {
      return NextResponse.json({ error: `Project could not be started: ${assignmentError.message}` }, { status: 400 });
    }
    return NextResponse.json({ data: publicAssignment(assignment), message: 'Project started.' }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Project could not be started.' }, { status: 500 });
  }
}
