import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

export const runtime = 'nodejs';

const artifactTypes = new Set([
  'learning_resource',
  'study_note',
  'project_evidence',
  'report',
  'external_link',
  'submission',
  'certificate',
  'achievement',
]);

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function cleanText(value: unknown, maximum: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maximum)
    : '';
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      && Boolean(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function safeName(value: string) {
  const name = value.trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
  return name || 'vault-file';
}

async function getStudent(req: Request) {
  const auth = await authenticateRequest(req);
  if ('error' in auth) return auth;
  const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
  if (role !== 'student') return { error: 'The learning and work vault is available to student accounts only.', status: 403 as const };
  return auth;
}

export async function GET(req: Request) {
  try {
    const auth = await getStudent(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [
      bookmarksResult,
      activityResult,
      courseworkResult,
      skillsResult,
      assignmentsResult,
      submissionsResult,
      certificatesResult,
      theoryCertificatesResult,
      artifactsResult,
      companiesResult,
    ] = await Promise.all([
      auth.supabase.from('learning_bookmarks').select('id,video_id,title,channel,thumbnail,topic,created_at').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }),
      auth.supabase.from('learning_activity').select('id,video_id,title,channel,thumbnail,topic,action,created_at').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }).limit(200),
      auth.supabase.from('coursework_maps').select('id,source_file_name,course_name,career_goal,summary,concepts,mapped_skills,project_suggestions,created_at').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }),
      auth.supabase.from('skill_evidence').select('id,skill,status,source_type,source_id,created_at').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }),
      auth.supabase.from('project_assignments').select('id,project_id,status,started_at,submitted_at,completed_at,updated_at,project:projects(id,title,scope,deliverables,acceptance_criteria,project_source,is_industry,required_skills,company_id,company_user_id,project_milestones(id,sequence,sequence_number,title,description,acceptance_criteria,required_deliverables,is_required,deadline))').eq('student_user_id', auth.user.id).order('updated_at', { ascending: false }),
      auth.supabase.from('submissions').select('id,project_id,assignment_id,milestone_id,evidence,reflection,status,company_decision,company_feedback,reviewed_at,created_at').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }),
      auth.supabase.from('certificates').select('*').eq('student_user_id', auth.user.id).order('issued_at', { ascending: false }),
      auth.supabase.from('theory_certificates').select('id,quiz_id,coursework_map_id,course_name,recipient_name,certificate_code,score,issued_at').eq('student_user_id', auth.user.id).order('issued_at', { ascending: false }),
      auth.supabase.from('student_vault_artifacts').select('*').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }),
      auth.supabase.from('companies').select('id,name').order('name'),
    ]);

    const firstError = [
      bookmarksResult.error,
      activityResult.error,
      courseworkResult.error,
      skillsResult.error,
      assignmentsResult.error,
      submissionsResult.error,
      certificatesResult.error,
      theoryCertificatesResult.error,
      artifactsResult.error,
      companiesResult.error,
    ].find(Boolean);
    if (firstError) return NextResponse.json({ error: `Vault records could not be loaded: ${firstError.message}` }, { status: 400 });

    const backfillRows: Array<Record<string, unknown>> = [];
    for (const item of bookmarksResult.data || []) {
      backfillRows.push({
        student_user_id: auth.user.id,
        source_key: `learning-bookmark:${item.video_id}`,
        artifact_type: 'learning_resource',
        title: item.title,
        description: item.topic ? `Saved learning resource for ${item.topic}` : 'Saved YouTube learning resource',
        external_url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.video_id)}`,
        verification_status: 'student_record',
        status: 'active',
        skill_names: item.topic ? [item.topic] : [],
        source_organization: item.channel || 'YouTube',
        metadata: { video_id: item.video_id, thumbnail: item.thumbnail || null },
        created_at: item.created_at,
      });
    }
    for (const item of courseworkResult.data || []) {
      backfillRows.push({
        student_user_id: auth.user.id,
        source_key: `coursework:${item.id}`,
        artifact_type: 'study_note',
        title: item.course_name,
        description: item.summary || 'Coursework map',
        verification_status: 'student_record',
        status: 'completed',
        skill_names: (item.mapped_skills || []).map((entry: any) => typeof entry === 'string' ? entry : entry.skill).filter(Boolean).slice(0, 30),
        source_organization: 'BuildBridge Coursework',
        metadata: { coursework_map_id: item.id, source_file_name: item.source_file_name },
        created_at: item.created_at,
      });
    }
    for (const item of submissionsResult.data || []) {
      backfillRows.push({
        student_user_id: auth.user.id,
        source_key: `submission:${item.id}`,
        artifact_type: 'submission',
        title: item.company_decision === 'approved' ? 'Approved project submission' : 'Project submission',
        description: item.reflection || item.company_feedback || 'Project evidence submission',
        project_id: item.project_id,
        milestone_id: item.milestone_id,
        evidence_id: item.id,
        verification_status: item.company_decision === 'approved' ? 'company_verified' : 'student_record',
        status: item.company_decision === 'approved' ? 'completed' : 'in_progress',
        metadata: { evidence: item.evidence, company_decision: item.company_decision },
        created_at: item.created_at,
      });
    }
    for (const item of certificatesResult.data || []) {
      backfillRows.push({
        student_user_id: auth.user.id,
        source_key: `certificate:${item.id}`,
        artifact_type: 'certificate',
        title: item.project_title || item.pathway_name || 'BuildBridge certificate',
        description: item.certificate_status === 'issued' ? 'Issued credential' : 'Revoked credential',
        project_id: item.project_id || null,
        skill_names: Array.isArray(item.skills) ? item.skills : [],
        source_organization: item.issuer_name || 'BuildBridge',
        verification_status: item.certificate_status === 'issued' ? 'issued' : 'revoked',
        status: 'completed',
        metadata: { certificate_id: item.id, certificate_code: item.certificate_code },
        created_at: item.issued_at,
      });
    }
    for (const item of theoryCertificatesResult.data || []) {
      backfillRows.push({
        student_user_id: auth.user.id,
        source_key: `theory-certificate:${item.id}`,
        artifact_type: 'certificate',
        title: item.course_name,
        description: `Theory certificate · ${item.score}%`,
        skill_names: [],
        source_organization: 'BuildBridge',
        verification_status: 'issued',
        status: 'completed',
        external_url: `/verify/${encodeURIComponent(item.certificate_code)}`,
        metadata: { certificate_code: item.certificate_code, score: item.score },
        created_at: item.issued_at,
      });
    }
    if (backfillRows.length) {
      const { error: backfillError } = await auth.supabase
        .from('student_vault_artifacts')
        .upsert(backfillRows, { onConflict: 'student_user_id,source_key', ignoreDuplicates: true });
      if (backfillError) return NextResponse.json({ error: `Automatic vault records could not be reconciled: ${backfillError.message}` }, { status: 400 });
    }

    const refreshedArtifactsResult = await auth.supabase
      .from('student_vault_artifacts')
      .select('*')
      .eq('student_user_id', auth.user.id)
      .order('created_at', { ascending: false });
    const artifacts = await Promise.all((refreshedArtifactsResult.data || []).map(async (artifact) => {
      let signedUrl: string | null = null;
      if (artifact.storage_path) {
        const { data } = await auth.supabase.storage
          .from('student-vault')
          .createSignedUrl(artifact.storage_path, 3600);
        signedUrl = data?.signedUrl || null;
      }
      return { ...artifact, signedUrl };
    }));

    const companyNames = new Map((companiesResult.data || []).map((company) => [company.id, company.name]));
    const projects = (assignmentsResult.data || []).map((assignment) => {
      const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
      if (!project) return assignment;
      return {
        ...assignment,
        project: {
          ...project,
          organization_name: project.project_source === 'practice'
            ? 'BuildBridge'
            : companyNames.get(project.company_id) || 'Company assignment',
        },
      };
    });

    const timeline: Array<{ id: string; date: string; category: string; title: string; description: string; projectId?: string; url?: string }> = [];
    for (const item of activityResult.data || []) timeline.push({
      id: `activity:${item.id}`,
      date: item.created_at,
      category: 'learning',
      title: item.action === 'completed' ? `Completed: ${item.title}` : `Opened: ${item.title}`,
      description: item.topic || 'Learning activity',
    });
    for (const item of courseworkResult.data || []) timeline.push({
      id: `coursework:${item.id}`,
      date: item.created_at,
      category: 'learning',
      title: item.course_name,
      description: item.summary || 'Coursework mapping',
    });
    for (const item of submissionsResult.data || []) timeline.push({
      id: `submission:${item.id}`,
      date: item.created_at,
      category: 'work',
      title: item.company_decision === 'approved' ? 'Submission approved' : item.status === 'submitted' ? 'Evidence submitted' : 'Evidence updated',
      description: item.reflection || item.company_feedback || 'Project evidence',
      projectId: item.project_id,
    });
    for (const item of certificatesResult.data || []) timeline.push({
      id: `certificate:${item.id}`,
      date: item.issued_at,
      category: 'achievement',
      title: item.project_title || item.pathway_name || 'BuildBridge certificate',
      description: item.certificate_status === 'issued' ? 'Credential issued' : 'Credential status updated',
      projectId: item.project_id || undefined,
      url: item.certificate_code ? `/verify/${encodeURIComponent(item.certificate_code)}` : undefined,
    });
    for (const item of theoryCertificatesResult.data || []) timeline.push({
      id: `theory-certificate:${item.id}`,
      date: item.issued_at,
      category: 'achievement',
      title: item.course_name,
      description: `Theory certificate · ${item.score}%`,
      url: `/verify/${encodeURIComponent(item.certificate_code)}`,
    });
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({
      data: {
        learningResources: bookmarksResult.data || [],
        learningHistory: activityResult.data || [],
        coursework: courseworkResult.data || [],
        skills: skillsResult.data || [],
        projects,
        submissions: submissionsResult.data || [],
        certificates: certificatesResult.data || [],
        theoryCertificates: theoryCertificatesResult.data || [],
        artifacts,
        timeline,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'The learning and work vault could not be loaded.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let storagePath = '';
  try {
    const auth = await getStudent(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const contentType = req.headers.get('content-type') || '';
    let body: Record<string, unknown> = {};
    let file: File | null = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      for (const key of ['title', 'description', 'artifactType', 'externalUrl', 'projectId', 'milestoneId', 'evidenceId', 'sourceOrganization', 'verificationStatus', 'status', 'skills']) {
        const value = form.get(key);
        if (typeof value === 'string') body[key] = value;
      }
      const uploaded = form.get('file');
      if (uploaded instanceof File) file = uploaded;
    } else {
      body = await req.json();
    }

    const artifactType = cleanText(body.artifactType, 40);
    if (!artifactTypes.has(artifactType)) return NextResponse.json({ error: 'Choose a supported vault artifact type.' }, { status: 400 });
    const title = cleanText(body.title, 180);
    if (!title) return NextResponse.json({ error: 'Artifact title is required.' }, { status: 400 });
    const description = cleanText(body.description, 3000);
    const externalUrl = cleanText(body.externalUrl, 1000);
    if (externalUrl && !validHttpUrl(externalUrl)) return NextResponse.json({ error: 'Enter a valid HTTP or HTTPS external URL.' }, { status: 400 });
    if (!file && !externalUrl && !['study_note', 'achievement', 'report'].includes(artifactType)) {
      return NextResponse.json({ error: 'Add a file or external URL to this vault artifact.' }, { status: 400 });
    }

    const skills = typeof body.skills === 'string'
      ? body.skills.split(',').map((skill) => skill.trim()).filter(Boolean)
      : Array.isArray(body.skills)
        ? body.skills.filter((skill): skill is string => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean)
        : [];

    const projectId = cleanText(body.projectId, 80) || null;
    const milestoneId = cleanText(body.milestoneId, 80) || null;
    const evidenceId = cleanText(body.evidenceId, 80) || null;
    if (projectId) {
      const [{ data: project }, { data: assignment }] = await Promise.all([
        auth.supabase.from('projects').select('id,status').eq('id', projectId).maybeSingle(),
        auth.supabase.from('project_assignments').select('id').eq('student_user_id', auth.user.id).eq('project_id', projectId).maybeSingle(),
      ]);
      if (!project || (!assignment && project.status !== 'published')) {
        return NextResponse.json({ error: 'The selected project is not associated with this student account.' }, { status: 404 });
      }
    }

    if (file) {
      if (!file.size || file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Vault files must be between 1 byte and 10 MB.' }, { status: 400 });
      }
      const mime = file.type.toLowerCase();
      if (!allowedMimeTypes.has(mime)) return NextResponse.json({ error: 'Unsupported vault file type.' }, { status: 415 });
      storagePath = `${auth.user.id}/${randomUUID()}-${safeName(file.name)}`;
      const { error: uploadError } = await auth.supabase.storage
        .from('student-vault')
        .upload(storagePath, await file.arrayBuffer(), { contentType: mime, upsert: false });
      if (uploadError) return NextResponse.json({ error: `Vault file could not be uploaded: ${uploadError.message}` }, { status: 400 });
    }

    const verificationStatus = ['student_record', 'demonstrated', 'company_verified', 'issued', 'revoked'].includes(cleanText(body.verificationStatus, 40))
      ? cleanText(body.verificationStatus, 40)
      : 'student_record';
    const status = ['active', 'completed', 'in_progress', 'archived', 'expired'].includes(cleanText(body.status, 40))
      ? cleanText(body.status, 40)
      : 'active';

    const { data, error } = await auth.supabase
      .from('student_vault_artifacts')
      .insert({
        student_user_id: auth.user.id,
        artifact_type: artifactType,
        title,
        description,
        external_url: externalUrl || null,
        storage_path: storagePath || null,
        project_id: projectId,
        milestone_id: milestoneId,
        evidence_id: evidenceId,
        skill_names: [...new Set(skills.map((skill) => skill.slice(0, 80)))].slice(0, 30),
        source_organization: cleanText(body.sourceOrganization, 180) || null,
        verification_status: verificationStatus,
        status,
        metadata: {},
      })
      .select('*')
      .single();
    if (error) {
      if (storagePath) await auth.supabase.storage.from('student-vault').remove([storagePath]);
      return NextResponse.json({ error: `Vault record could not be saved: ${error.message}` }, { status: 400 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Vault artifact could not be added.' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getStudent(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await req.json() as { artifactId?: string };
    const artifactId = cleanText(body.artifactId, 80);
    if (!artifactId) return NextResponse.json({ error: 'Artifact ID is required.' }, { status: 400 });
    const { data: artifact, error: lookupError } = await auth.supabase
      .from('student_vault_artifacts')
      .select('id,storage_path')
      .eq('id', artifactId)
      .eq('student_user_id', auth.user.id)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: `Vault artifact could not be checked: ${lookupError.message}` }, { status: 400 });
    if (!artifact) return NextResponse.json({ error: 'Vault artifact not found.' }, { status: 404 });
    const { error: deleteError } = await auth.supabase
      .from('student_vault_artifacts')
      .delete()
      .eq('id', artifact.id)
      .eq('student_user_id', auth.user.id);
    if (deleteError) return NextResponse.json({ error: `Vault artifact could not be deleted: ${deleteError.message}` }, { status: 400 });
    if (artifact.storage_path) {
      await auth.supabase.storage.from('student-vault').remove([artifact.storage_path]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Vault artifact could not be deleted.' }, { status: 500 });
  }
}
