import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

type CertificateType = 'project_learning' | 'skill_demonstration' | 'learning_pathway_completion';
type RoadmapStep = { learningTopics?: unknown; requiredSkills?: unknown };
type ProjectMilestone = { id: string; sequence: number; sequence_number?: number; is_required?: boolean };

function isCertificateType(value: unknown): value is CertificateType {
  return value === 'project_learning'
    || value === 'skill_demonstration'
    || value === 'learning_pathway_completion';
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const role = await getProfileRole(supabase, user.id, user.email);
    if (role !== 'admin') return NextResponse.json({ error: 'Only the platform administrator can issue BuildBridge learning certificates.' }, { status: 403 });

    const body = await req.json() as Record<string, unknown>;
    if (!isCertificateType(body.certificateType)) {
      return NextResponse.json({ error: 'Choose a supported BuildBridge certificate type.' }, { status: 400 });
    }

    const studentUserId = typeof body.studentUserId === 'string' ? body.studentUserId : '';
    const { data: student, error: studentError } = await supabase
      .from('profiles')
      .select('id,full_name,role')
      .eq('id', studentUserId)
      .maybeSingle();
    if (studentError) return NextResponse.json({ error: `Student account could not be checked: ${studentError.message}` }, { status: 400 });
    if (!student || student.role !== 'student') return NextResponse.json({ error: 'Choose a valid student account.' }, { status: 400 });
    const recipientName = String(student.full_name || '').trim();
    if (!recipientName) return NextResponse.json({ error: 'The student must add a full name to their profile before a certificate can be issued.' }, { status: 409 });

    if (body.certificateType === 'learning_pathway_completion') {
      const pathwayName = typeof body.pathwayName === 'string' ? body.pathwayName.trim() : '';
      if (!pathwayName || pathwayName.length > 120) {
        return NextResponse.json({ error: 'Enter the name of the student’s saved learning pathway.' }, { status: 400 });
      }

      const [{ data: roadmap, error: roadmapError }, { data: activities, error: activityError }, { data: skillRows, error: skillsError }] = await Promise.all([
        supabase.from('student_roadmaps').select('steps').eq('student_user_id', studentUserId).eq('career_goal', pathwayName).maybeSingle(),
        supabase.from('learning_activity').select('topic,action').eq('student_user_id', studentUserId).eq('action', 'completed'),
        supabase.from('skill_evidence').select('skill,status').eq('student_user_id', studentUserId),
      ]);
      const queryError = roadmapError || activityError || skillsError;
      if (queryError) return NextResponse.json({ error: `Pathway completion evidence could not be checked: ${queryError.message}` }, { status: 400 });
      const steps = Array.isArray(roadmap?.steps) ? roadmap.steps as RoadmapStep[] : [];
      if (!steps.length) return NextResponse.json({ error: 'This student has no saved roadmap for that pathway.' }, { status: 409 });

      const completedTopics = new Set((activities || []).map((item) => String(item.topic || '').trim().toLowerCase()).filter(Boolean));
      const demonstratedSkills = new Set((skillRows || [])
        .filter((item) => item.status === 'demonstrated' || item.status === 'company_verified')
        .map((item) => String(item.skill || '').trim().toLowerCase())
        .filter(Boolean));
      const completed = steps.every((step) => {
        const topics = normalizeList(step.learningTopics);
        const requiredSkills = normalizeList(step.requiredSkills);
        const firstTopic = (topics[0] || requiredSkills[0] || '').toLowerCase();
        return Boolean(firstTopic && completedTopics.has(firstTopic))
          || requiredSkills.some((skill) => demonstratedSkills.has(skill.toLowerCase()));
      });
      if (!completed) return NextResponse.json({ error: 'Every step in the saved learning pathway must have recorded completion or demonstrated-skill evidence.' }, { status: 409 });

      const pathwaySkills = [...new Set(steps.flatMap((step) => normalizeList(step.requiredSkills))
        .filter((skill) => demonstratedSkills.has(skill.toLowerCase())))];
      const { data: certificate, error } = await supabase.from('certificates').insert({
        student_user_id: studentUserId,
        certificate_type: body.certificateType,
        recipient_name: recipientName,
        pathway_name: pathwayName,
        skills: pathwaySkills,
        issuer_name: 'BuildBridge',
      }).select('*').single();
      if (error?.code === '23505') return NextResponse.json({ error: 'A certificate has already been issued for this learning pathway.' }, { status: 409 });
      if (error) return NextResponse.json({ error: `Learning pathway certificate could not be issued: ${error.message}` }, { status: 400 });
      return NextResponse.json({ data: certificate }, { status: 201 });
    }

    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    if (!projectId) return NextResponse.json({ error: 'Choose the project associated with this certificate.' }, { status: 400 });
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id,title,scope,required_skills,project_source,is_industry,project_milestones(id,sequence,sequence_number,is_required)')
      .eq('id', projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: `Project could not be checked: ${projectError.message}` }, { status: 400 });
    if (!project) return NextResponse.json({ error: 'The selected project is unavailable.' }, { status: 404 });
    if (project.project_source !== 'practice' || project.is_industry) {
      return NextResponse.json({ error: 'BuildBridge project-learning credentials are issued only for BuildBridge Practice Projects. Company credentials require company approval.' }, { status: 409 });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('project_assignments')
      .select('id,status')
      .eq('student_user_id', studentUserId)
      .eq('project_id', projectId)
      .maybeSingle();
    if (assignmentError) return NextResponse.json({ error: `Project assignment could not be checked: ${assignmentError.message}` }, { status: 400 });
    if (!assignment) return NextResponse.json({ error: 'The student must have a persistent assignment for this project.' }, { status: 409 });

    const [{ data: progress, error: progressError }, { data: submissions, error: submissionsError }, { data: skillRows, error: skillsError }] = await Promise.all([
      supabase.from('project_assignment_milestones').select('milestone_id,status,submission_id').eq('assignment_id', assignment.id),
      supabase.from('submissions').select('id,milestone_id,evidence,created_at,status').eq('assignment_id', assignment.id).eq('student_user_id', studentUserId).order('created_at', { ascending: false }),
      supabase.from('skill_evidence').select('skill,status,source_id').eq('student_user_id', studentUserId),
    ]);
    const evidenceError = progressError || submissionsError || skillsError;
    if (evidenceError) return NextResponse.json({ error: `Project evidence could not be checked: ${evidenceError.message}` }, { status: 400 });

    const milestones = [...(project.project_milestones || []) as ProjectMilestone[]]
      .sort((a, b) => (a.sequence_number || a.sequence) - (b.sequence_number || b.sequence));
    const requiredMilestones = milestones.filter((milestone) => milestone.is_required !== false);
    const progressByMilestone = new Map((progress || []).map((item) => [item.milestone_id, item]));
    const submissionsById = new Map((submissions || []).map((item) => [item.id, item]));
    if (!requiredMilestones.length || assignment.status !== 'completed' || requiredMilestones.some((milestone) => {
      const state = progressByMilestone.get(milestone.id);
      const submission = state?.submission_id ? submissionsById.get(state.submission_id) : null;
      return state?.status !== 'completed'
        || !submission
        || typeof submission.evidence?.storagePath !== 'string'
        || !submission.evidence.storagePath;
    })) {
      return NextResponse.json({ error: 'Every required practice-project milestone must have submitted evidence before a platform certificate can be issued.' }, { status: 409 });
    }

    const provenSkills = [...new Map((skillRows || [])
      .filter((item) => item.source_id === projectId && (item.status === 'demonstrated' || item.status === 'company_verified'))
      .map((item) => [String(item.skill).toLowerCase(), String(item.skill).trim()]))
      .values()];
    let skills = provenSkills;
    if (body.certificateType === 'skill_demonstration') {
      const requestedSkills = normalizeList(body.skills);
      if (!requestedSkills.length) return NextResponse.json({ error: 'Choose at least one demonstrated skill linked to this project.' }, { status: 400 });
      const provenByName = new Map(provenSkills.map((skill) => [skill.toLowerCase(), skill]));
      skills = [...new Set(requestedSkills.map((skill) => provenByName.get(skill.toLowerCase())).filter((skill): skill is string => Boolean(skill)))];
      if (skills.length !== new Set(requestedSkills.map((skill) => skill.toLowerCase())).size) {
        return NextResponse.json({ error: 'Every selected skill must have demonstrated or company-verified evidence linked to this project.' }, { status: 409 });
      }
    }

    const finalMilestone = requiredMilestones[requiredMilestones.length - 1];
    const finalMilestoneState = progressByMilestone.get(finalMilestone.id);
    const finalSubmission = finalMilestoneState?.submission_id
      ? submissionsById.get(finalMilestoneState.submission_id)
      : null;
    if (!finalSubmission) return NextResponse.json({ error: 'The final milestone submission could not be found.' }, { status: 409 });

    const { data: certificate, error } = await supabase.from('certificates').insert({
      student_user_id: studentUserId,
      project_id: projectId,
      submission_id: finalSubmission.id,
      assignment_id: assignment.id,
      certificate_type: body.certificateType,
      recipient_name: recipientName,
      project_title: project.title,
      project_description: String(project.scope || '').slice(0, 600),
      skills,
      issuer_name: 'BuildBridge',
    }).select('*').single();
    if (error?.code === '23505') return NextResponse.json({ error: 'This certificate has already been issued for the selected project assignment.' }, { status: 409 });
    if (error) return NextResponse.json({ error: `Project certificate could not be issued: ${error.message}` }, { status: 400 });
    return NextResponse.json({ data: certificate }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Certificate could not be issued.' }, { status: 500 });
  }
}
