import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getProfileRole } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

type UserRole = 'student' | 'company_member' | 'admin';

function getAuthedClient(token: string) {
  const configuration = getSupabaseConfiguration();
  if (configuration.error) return null;
  return createClient(configuration.url, configuration.key, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function getUser(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Authentication required.', status: 401 as const };
  const supabase = getAuthedClient(token);
  if (!supabase) return { error: 'Supabase environment variables are missing on the server.', status: 503 as const };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Your session is invalid or expired. Sign in again.', status: 401 as const };
  return { supabase, user, token };
}

export async function GET(req: Request) {
  try {
    const auth = await getUser(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const action = new URL(req.url).searchParams.get('action') || 'profile';

    if (action === 'workspace') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id,email,full_name,role,career_goal,phone_number,avatar_path,created_at,preferred_language,learning_personalization_enabled,bio,education_level,institution,field_of_study,profile_skills,location,degree,department,academic_year,graduation_year,cgpa,coursework,linkedin_url,github_url,portfolio_url,resume_url')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) return NextResponse.json({ error: `Could not load your profile: ${profileError.message}` }, { status: 400 });
      if (!profile) return NextResponse.json({ error: 'Your BuildBridge profile is missing. Run supabase/auth-setup-repair.sql, then sign in again.' }, { status: 409 });
      if (profile.role === 'admin' && await getProfileRole(supabase, user.id, user.email) !== 'admin') {
        return NextResponse.json({ error: 'This account is not the configured platform owner.' }, { status: 403 });
      }

      let projectsQuery = supabase.from('projects').select('*, project_milestones(*)').order('created_at', { ascending: false });
      if (profile.role === 'company_member') projectsQuery = projectsQuery.eq('company_user_id', user.id);
      if (profile.role === 'student') projectsQuery = projectsQuery.eq('status', 'published');
      const assignmentsQuery = profile.role === 'student'
        ? supabase.from('project_assignments')
          .select('id,project_id,student_user_id,status,started_at,updated_at,submitted_at,completed_at,project:projects(id,title,scope,deliverables,acceptance_criteria,deadline,payment_terms,status,project_source,is_industry,project_milestones(id,sequence,sequence_number,title,description,acceptance_criteria,required_deliverables,is_required,deadline))')
          .eq('student_user_id', user.id).order('updated_at', { ascending: false })
        : profile.role === 'company_member'
          ? supabase.from('project_assignments')
            .select('id,project_id,student_user_id,status,started_at,updated_at,submitted_at,completed_at,project:projects(id,title,scope,deliverables,acceptance_criteria,deadline,payment_terms,status,project_source,is_industry,project_milestones(id,sequence,sequence_number,title,description,acceptance_criteria,required_deliverables,is_required,deadline))')
            .eq('company_user_id', user.id).order('updated_at', { ascending: false })
          : profile.role === 'admin'
            ? supabase.from('project_assignments')
              .select('id,project_id,student_user_id,status,started_at,updated_at,submitted_at,completed_at,project:projects(id,title,scope,deliverables,acceptance_criteria,deadline,payment_terms,status,project_source,is_industry,project_milestones(id,sequence,sequence_number,title,description,acceptance_criteria,required_deliverables,is_required,deadline))')
              .order('updated_at', { ascending: false })
            : Promise.resolve({ data: [], error: null });
      const [projectsResult, opportunitiesResult, submissionsResult, certificatesResult, skillsResult, applicationsResult, activityResult, assignmentsResult] = await Promise.all([
        projectsQuery,
        supabase.from('opportunities').select('*').order('created_at', { ascending: false }),
        supabase.from('submissions').select('*').order('created_at', { ascending: false }),
        supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
        supabase.from('skill_evidence').select('*').order('created_at', { ascending: false }),
        supabase.from('applications').select('id,opportunity_id,status,created_at').eq('student_user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('learning_activity').select('*').order('created_at', { ascending: false }).limit(100),
        assignmentsQuery,
      ]);
      const assignmentIds = (assignmentsResult.data || []).map((assignment: any) => assignment.id).filter(Boolean);
      const assignmentMilestonesResult = assignmentIds.length
        ? await supabase.from('project_assignment_milestones')
          .select('id,assignment_id,milestone_id,status,submission_id,feedback,started_at,submitted_at,reviewed_at,completed_at,created_at,updated_at')
          .in('assignment_id', assignmentIds)
        : { data: [], error: null };
      const firstError = [projectsResult.error, opportunitiesResult.error, submissionsResult.error, certificatesResult.error, skillsResult.error, applicationsResult.error, activityResult.error, assignmentsResult.error, assignmentMilestonesResult.error].find(Boolean);
      if (firstError) return NextResponse.json({ error: `Workspace data could not be loaded: ${firstError.message}` }, { status: 400 });

      const data: Record<string, unknown> = {
        profile,
        projects: profile.role === 'student'
          ? (projectsResult.data || []).map((project) => {
            const studentProject = { ...project };
            delete studentProject.company_id;
            delete studentProject.company_user_id;
            delete studentProject.published_by;
            return studentProject;
          })
          : projectsResult.data || [],
        opportunities: opportunitiesResult.data || [],
        submissions: submissionsResult.data || [],
        certificates: certificatesResult.data || [],
        skills: skillsResult.data || [],
        applications: applicationsResult.data || [],
        learningActivity: activityResult.data || [],
        assignments: assignmentsResult.data || [],
        assignmentMilestones: assignmentMilestonesResult.data || [],
      };

      if (profile.role === 'company_member') {
        const { data: company, error } = await supabase.from('companies').select('*').eq('owner_user_id', user.id).maybeSingle();
        if (error) return NextResponse.json({ error: `Company profile could not be loaded: ${error.message}` }, { status: 400 });
        data.company = company;
        if (company) {
          const { data: signatory, error: signatoryError } = await supabase
            .from('company_certificate_signatories')
            .select('id,signatory_name,signatory_title,authorized_at')
            .eq('company_id', company.id)
            .maybeSingle();
          if (signatoryError) return NextResponse.json({ error: `Certificate authorization could not be loaded: ${signatoryError.message}` }, { status: 400 });
          data.certificateSignatory = signatory;
        } else {
          data.certificateSignatory = null;
        }
      }

      if (profile.role === 'admin') {
        const [companies, profiles, auditLogs, aiUsage, companyRequests] = await Promise.all([
          supabase.from('companies').select('*').order('created_at', { ascending: false }),
          supabase.from('profiles').select('id,email,full_name,role,created_at').order('created_at', { ascending: false }),
          supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
          supabase.from('ai_usage_events').select('id,feature,model,status,success,failure_category,duration_ms,correlation_id,created_at').order('created_at', { ascending: false }).limit(100),
          supabase.from('company_domain_requests').select('id,user_id,organization_name,email_domain,status,email_verified_at,dns_verified_at,official_website,created_at,reviewed_at,review_note').order('created_at', { ascending: false }),
        ]);
        const adminError = [companies.error, profiles.error, auditLogs.error, companyRequests.error].find(Boolean);
        if (adminError) return NextResponse.json({ error: `Admin data could not be loaded: ${adminError.message}` }, { status: 400 });
        data.companies = companies.data || [];
        data.users = profiles.data || [];
        data.auditLogs = auditLogs.data || [];
        data.aiUsage = aiUsage.error ? [] : aiUsage.data || [];
        data.companyRequests = companyRequests.error ? [] : companyRequests.data || [];
      }

      return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const queries: Record<string, () => PromiseLike<any>> = {
      profile: () => supabase.from('profiles').select('id,email,full_name,role,career_goal,phone_number,avatar_path,created_at').eq('id', user.id).maybeSingle(),
      projects: () => supabase.from('projects').select('*, project_milestones(*)').order('created_at', { ascending: false }),
      opportunities: () => supabase.from('opportunities').select('*').order('created_at', { ascending: false }),
      submissions: () => supabase.from('submissions').select('*').order('created_at', { ascending: false }),
      certificates: () => supabase.from('certificates').select('*').order('issued_at', { ascending: false }),
      skills: () => supabase.from('skill_evidence').select('*').order('created_at', { ascending: false }),
      company: () => supabase.from('companies').select('*').eq('owner_user_id', user.id).maybeSingle(),
    };
    const query = queries[action];
    if (!query) return NextResponse.json({ error: 'Unsupported backend query.' }, { status: 400 });
    const { data, error } = await query();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (action === 'projects' && Array.isArray(data) && await getProfileRole(supabase, user.id, user.email) === 'student') {
      return NextResponse.json({
        data: data.map((project) => {
          const studentProject = { ...project };
          delete studentProject.company_id;
          delete studentProject.company_user_id;
          delete studentProject.published_by;
          return studentProject;
        }),
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Backend request failed.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUser(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;
    const body = await req.json();
    let data: unknown = null;
    let error: { message: string } | null = null;

    if (body.action === 'update_profile') {
      const updates: Record<string, string | null> = {};
      if (body.careerGoal !== undefined) {
        const careerGoal = String(body.careerGoal || '').trim();
        if (!careerGoal) return NextResponse.json({ error: 'Choose a career goal first.' }, { status: 400 });
        updates.career_goal = careerGoal;
      }
      if (body.fullName !== undefined) {
        const fullName = String(body.fullName || '').trim();
        if (!fullName || fullName.length > 120) return NextResponse.json({ error: 'Full name must be between 1 and 120 characters.' }, { status: 400 });
        updates.full_name = fullName;
      }
      if (body.phoneNumber !== undefined) {
        const phoneNumber = String(body.phoneNumber || '').trim();
        if (phoneNumber && !/^\+?[0-9][0-9\s().-]{5,23}$/.test(phoneNumber)) {
          return NextResponse.json({ error: 'Enter a valid phone number, including country code if needed.' }, { status: 400 });
        }
        updates.phone_number = phoneNumber || null;
      }
      if (body.avatarPath !== undefined) {
        const avatarPath = String(body.avatarPath || '').trim();
        if (avatarPath && (!avatarPath.startsWith(`${user.id}/`) || avatarPath.includes('..') || avatarPath.length > 255)) {
          return NextResponse.json({ error: 'Profile photo path is invalid.' }, { status: 400 });
        }
        updates.avatar_path = avatarPath || null;
      }
      if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Provide at least one profile detail to update.' }, { status: 400 });
      const result = await supabase.from('profiles').update(updates).eq('id', user.id).select('id,email,full_name,role,career_goal,phone_number,avatar_path,created_at').single();
      data = result.data; error = result.error;
    } else if (body.action === 'authorize_certificate_issuer') {
      const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      if (profileError) return NextResponse.json({ error: `Your account role could not be checked: ${profileError.message}` }, { status: 400 });
      if (profile?.role !== 'company_member') return NextResponse.json({ error: 'Only a company account can authorize its certificate signatory.' }, { status: 403 });
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id,verified')
        .eq('owner_user_id', user.id)
        .maybeSingle();
      if (companyError) return NextResponse.json({ error: `Company verification could not be checked: ${companyError.message}` }, { status: 400 });
      if (!company?.verified) return NextResponse.json({ error: 'Only an administrator-verified company can authorize a certificate signatory.' }, { status: 403 });

      if (body.authorized !== true) {
        const result = await supabase.from('company_certificate_signatories').delete().eq('company_id', company.id).eq('company_user_id', user.id);
        data = { authorized: false }; error = result.error;
      } else {
        const signatoryName = String(body.signatoryName || '').trim();
        const signatoryTitle = String(body.signatoryTitle || '').trim();
        if (signatoryName.length < 2 || signatoryName.length > 120 || signatoryTitle.length < 2 || signatoryTitle.length > 120) {
          return NextResponse.json({ error: 'Provide the authorized signatory’s name and designation (2–120 characters each).' }, { status: 400 });
        }
        const result = await supabase.from('company_certificate_signatories').upsert({
          company_id: company.id,
          company_user_id: user.id,
          signatory_name: signatoryName,
          signatory_title: signatoryTitle,
          authorized_by: user.id,
          authorized_at: new Date().toISOString(),
        }, { onConflict: 'company_id' }).select('id,signatory_name,signatory_title,authorized_at').single();
        data = result.data; error = result.error;
      }
    } else if (body.action === 'create_company_profile') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'company_member') {
        return NextResponse.json({ error: 'Only an approved company account can create an organization profile.' }, { status: 403 });
      }
      const name = String(body.name || '').trim();
      if (!name || name.length > 160) return NextResponse.json({ error: 'Organization name is required and must be 160 characters or fewer.' }, { status: 400 });
      const organizationUpdates: Record<string, string | null> = { name };
      const fields: Array<[string, string, number]> = [
        ['organizationType', 'organization_type', 120],
        ['industry', 'industry', 160],
        ['officialWebsite', 'official_website', 500],
        ['organizationEmail', 'organization_email', 320],
        ['description', 'description', 3000],
        ['countryOfRegistration', 'country_of_registration', 120],
        ['businessRegistration', 'business_registration', 500],
        ['headquarters', 'headquarters', 180],
        ['organizationContact', 'organization_contact', 320],
        ['representativeName', 'authorized_representative_name', 120],
        ['representativeTitle', 'authorized_representative_title', 120],
        ['representativePhone', 'authorized_representative_phone', 40],
      ];
      for (const [inputKey, column, maximum] of fields) {
        if (body[inputKey] !== undefined) organizationUpdates[column] = String(body[inputKey] || '').trim().slice(0, maximum) || null;
      }
      if (typeof organizationUpdates.official_website === 'string') {
        try {
          const website = new URL(organizationUpdates.official_website);
          if (!['https:', 'http:'].includes(website.protocol) || website.username || website.password) throw new Error();
        } catch {
          return NextResponse.json({ error: 'Enter a valid HTTP or HTTPS official website.' }, { status: 400 });
        }
      }
      if (typeof organizationUpdates.organization_email === 'string') {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(organizationUpdates.organization_email)) {
          return NextResponse.json({ error: 'Enter a valid organization email address.' }, { status: 400 });
        }
      }
      const { data: existingCompany, error: existingError } = await supabase.from('companies')
        .select('id').eq('owner_user_id', user.id).maybeSingle();
      if (existingError) return NextResponse.json({ error: `Existing organization profile could not be checked: ${existingError.message}` }, { status: 400 });
      const result = existingCompany
        ? await supabase.from('companies').update(organizationUpdates).eq('id', existingCompany.id).select().single()
        : await supabase.from('companies').insert({ owner_user_id: user.id, ...organizationUpdates }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'create_project') {
      const title = String(body.title || '').trim();
      const scope = String(body.scope || '').trim();
      if (!title || !scope) return NextResponse.json({ error: 'Project title and scope are required.' }, { status: 400 });
      const result = await supabase.from('projects').insert({ title, scope, company_user_id: user.id, status: 'draft' }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'create_opportunity') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'company_member') return NextResponse.json({ error: 'Only a company account can publish opportunities.' }, { status: 403 });
      const { data: company, error: companyError } = await supabase.from('companies')
        .select('id,verified').eq('owner_user_id', user.id).maybeSingle();
      if (companyError) return NextResponse.json({ error: `Company access could not be checked: ${companyError.message}` }, { status: 400 });
      if (!company?.verified) return NextResponse.json({ error: 'Only an administrator-verified company can create opportunities.' }, { status: 403 });
      const title = String(body.title || '').trim();
      const scope = String(body.scope || '').trim();
      const deliverables = String(body.deliverables || '').trim();
      const acceptanceCriteria = String(body.acceptanceCriteria || '').trim();
      if (title.length < 4 || title.length > 180 || !scope || scope.length > 5000 || !deliverables || deliverables.length > 3000 || !acceptanceCriteria || acceptanceCriteria.length > 3000) {
        return NextResponse.json({ error: 'Provide a title (4–180 characters), scope, deliverables and acceptance criteria within the stated limits.' }, { status: 400 });
      }
      const list = (value: unknown, maximum = 20) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 80)).filter(Boolean))].slice(0, maximum) : [];
      const eligibilityInput = body.eligibility && typeof body.eligibility === 'object' && !Array.isArray(body.eligibility) ? body.eligibility as Record<string, unknown> : {};
      const minimumCgpa = Number(eligibilityInput.minimumCgpa);
      const eligibility = {
        description: String(eligibilityInput.description || '').trim().slice(0, 1500),
        minimumEducationLevel: String(eligibilityInput.minimumEducationLevel || '').trim().slice(0, 100),
        minimumAcademicYear: String(eligibilityInput.minimumAcademicYear || '').trim().slice(0, 80),
        minimumCgpa: Number.isFinite(minimumCgpa) && minimumCgpa >= 0 && minimumCgpa <= 100 ? minimumCgpa : null,
        eligibleLocations: list(eligibilityInput.eligibleLocations, 12),
      };
      const result = await supabase.from('opportunities').insert({
        company_id: company.id,
        created_by: user.id,
        title,
        kind: String(body.kind || 'internship').slice(0, 60),
        scope,
        deliverables,
        acceptance_criteria: acceptanceCriteria,
        deadline: body.deadline || null,
        revision_policy: String(body.revisionPolicy || '').trim().slice(0, 2000),
        payment_terms: String(body.paymentTerms || '').trim().slice(0, 1000),
        eligibility,
        required_skills: list(body.requiredSkills),
        career_goals: list(body.careerGoals, 12),
        experience_level: String(body.experienceLevel || '').trim().slice(0, 80) || null,
        location: String(body.location || '').trim().slice(0, 160) || null,
        is_remote: body.isRemote === true,
        status: 'draft',
      }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'update_opportunity_status') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'company_member') return NextResponse.json({ error: 'Only a company account can update its opportunities.' }, { status: 403 });
      const opportunityId = String(body.opportunityId || '').trim();
      const status = body.status === 'published' || body.status === 'closed' ? body.status : 'draft';
      if (!opportunityId) return NextResponse.json({ error: 'Choose an opportunity first.' }, { status: 400 });
      const result = await supabase.from('opportunities').update({ status, updated_at: new Date().toISOString() })
        .eq('id', opportunityId).eq('created_by', user.id).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'submit_evidence') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'student') return NextResponse.json({ error: 'Only student accounts can submit project evidence.' }, { status: 403 });
      const projectId = String(body.projectId || '');
      const assignmentId = String(body.assignmentId || '');
      const milestoneId = String(body.milestoneId || '');
      const storagePath = String(body.evidence?.storagePath || '');
      if (!projectId || !assignmentId || !milestoneId || !storagePath) {
        return NextResponse.json({ error: 'A project assignment, milestone, and uploaded evidence file are required.' }, { status: 400 });
      }
      if (!storagePath.startsWith(`${user.id}/${projectId}/`) || storagePath.includes('..')) {
        return NextResponse.json({ error: 'Evidence must be stored in your folder for this project.' }, { status: 400 });
      }
      if (typeof body.evidence !== 'object' || body.evidence === null
        || typeof body.evidence.fileName !== 'string'
        || body.evidence.fileName.trim().length === 0
        || body.evidence.fileName.length > 255
        || typeof body.evidence.size !== 'number'
        || !Number.isFinite(body.evidence.size)
        || body.evidence.size <= 0
        || body.evidence.size > 10 * 1024 * 1024
      ) {
        return NextResponse.json({ error: 'Submit valid evidence file metadata.' }, { status: 400 });
      }
      if (typeof body.reflection !== 'string' || body.reflection.trim().length > 4000) {
        return NextResponse.json({ error: 'Reflection must be 4,000 characters or fewer.' }, { status: 400 });
      }
      const { data: assignment, error: assignmentError } = await supabase
        .from('project_assignments')
        .select('id,project_id,student_user_id,status,project:projects(project_milestones(id))')
        .eq('id', assignmentId)
        .eq('project_id', projectId)
        .eq('student_user_id', user.id)
        .maybeSingle();
      if (assignmentError) return NextResponse.json({ error: `Project assignment could not be checked: ${assignmentError.message}` }, { status: 400 });
      if (!assignment) return NextResponse.json({ error: 'Start this project before submitting evidence.' }, { status: 403 });
      const assignedProject = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
      if (!(assignedProject?.project_milestones || []).some((milestone: { id: string }) => milestone.id === milestoneId)) {
        return NextResponse.json({ error: 'The selected milestone does not belong to this project.' }, { status: 400 });
      }
      const result = await supabase.from('submissions').insert({
        project_id: projectId,
        assignment_id: assignmentId,
        milestone_id: milestoneId,
        student_user_id: user.id,
        evidence: body.evidence,
        reflection: String(body.reflection || '').trim(),
        status: 'submitted',
      }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'apply_opportunity') {
      if (!body.opportunityId) return NextResponse.json({ error: 'Choose an opportunity first.' }, { status: 400 });
      const result = await supabase.from('applications').insert({ opportunity_id: body.opportunityId, student_user_id: user.id }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'record_learning_topic') {
      const topic = String(body.topic || '').trim();
      const activity = body.activity === 'completed' ? 'completed' : body.activity === 'opened' ? 'opened' : '';
      if (!topic || topic.length > 100 || !activity) {
        return NextResponse.json({ error: 'Choose a valid learning topic and activity.' }, { status: 400 });
      }
      const result = await supabase.from('learning_activity').insert({
        student_user_id: user.id,
        video_id: null,
        title: topic,
        topic,
        action: activity,
      }).select().single();
      data = result.data; error = result.error;
    } else if (body.action === 'record_learning_activity') {
      const videoId = String(body.videoId || '').trim();
      const title = String(body.title || '').trim();
      const topic = String(body.topic || '').trim();
      const activity = body.activity === 'completed' ? 'completed' : body.activity === 'opened' ? 'opened' : '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || title.length > 300 || topic.length > 100 || !activity) {
        return NextResponse.json({ error: 'A valid video, title and learning activity are required.' }, { status: 400 });
      }
      const { data: existingActivity } = await supabase
        .from('learning_activity')
        .select('id')
        .eq('student_user_id', user.id)
        .eq('video_id', videoId)
        .eq('action', activity)
        .limit(1)
        .maybeSingle();
      if (existingActivity) {
        data = existingActivity;
        error = null;
      } else {
        const result = await supabase.from('learning_activity').insert({
          student_user_id: user.id,
          video_id: videoId,
          title,
          channel: String(body.channel || '').slice(0, 200) || null,
          thumbnail: String(body.thumbnail || '').slice(0, 1000) || null,
          topic: topic || null,
          action: activity,
        }).select().single();
        data = result.data; error = result.error;
      }
    } else if (body.action === 'set_learning_bookmark') {
      const videoId = String(body.videoId || '').trim();
      const title = String(body.title || '').trim();
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !title || title.length > 300) {
        return NextResponse.json({ error: 'A valid video and title are required.' }, { status: 400 });
      }
      if (body.bookmarked === true) {
        const result = await supabase.from('learning_bookmarks').upsert({
          student_user_id: user.id,
          video_id: videoId,
          title,
          channel: String(body.channel || '').slice(0, 200) || null,
          thumbnail: String(body.thumbnail || '').slice(0, 1000) || null,
          topic: String(body.topic || '').slice(0, 100) || null,
        }, { onConflict: 'student_user_id,video_id' }).select().single();
        data = result.data; error = result.error;
      } else {
        const result = await supabase.from('learning_bookmarks').delete()
          .eq('student_user_id', user.id).eq('video_id', videoId);
        data = { removed: true }; error = result.error;
      }
    } else if (body.action === 'send_admin_announcement') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'admin') return NextResponse.json({ error: 'Only the configured platform administrator can send announcements.' }, { status: 403 });
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.APP_BASE_URL) {
        return NextResponse.json({ error: 'Announcement delivery requires RESEND_API_KEY, EMAIL_FROM and APP_BASE_URL. Custom sender domains are not accepted here.' }, { status: 503 });
      }
      const subject = String(body.subject || '').trim();
      const bodyText = String(body.body || '').trim();
      if (subject.length < 4 || subject.length > 120 || bodyText.length < 20 || bodyText.length > 5000) {
        return NextResponse.json({ error: 'Enter a subject of 4–120 characters and a message of 20–5,000 characters.' }, { status: 400 });
      }
      const admin = createAdminClient();
      if (!admin) return NextResponse.json({ error: 'Announcement delivery is not configured on the server.' }, { status: 503 });
      const { data: recipients, error: recipientsError } = await admin
        .from('profiles')
        .select('id,email')
        .not('email', 'is', null);
      if (recipientsError) return NextResponse.json({ error: `Announcement recipients could not be loaded: ${recipientsError.message}` }, { status: 400 });
      const announcementId = crypto.randomUUID();
      let queued = 0;
      for (const recipient of recipients || []) {
        const email = String(recipient.email || '').trim();
        if (!email) continue;
        const { error: enqueueError } = await admin.from('email_outbox').insert({
          user_id: recipient.id,
          recipient_email: email,
          event_type: 'admin_announcement',
          subject,
          payload: { body: bodyText, announcementId, customDomainAllowed: false },
          dedupe_key: `admin-announcement:${announcementId}:${recipient.id}`,
          status: 'pending',
        });
        if (!enqueueError) queued++;
      }
      data = { announcementId, queuedRecipients: queued };
      error = null;
    } else if (body.action === 'verify_company') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'admin') {
        return NextResponse.json({ error: 'Only the configured platform administrator can verify companies.' }, { status: 403 });
      }
      const companyId = typeof body.companyId === 'string' ? body.companyId.trim() : '';
      if (!companyId) return NextResponse.json({ error: 'Company ID is required.' }, { status: 400 });
      const admin = createAdminClient();
      if (!admin) return NextResponse.json({ error: 'Company verification is not configured on the server.' }, { status: 503 });
      const { data: company, error: companyError } = await admin.from('companies')
        .select('id,owner_user_id').eq('id', companyId).maybeSingle();
      if (companyError) return NextResponse.json({ error: `Company could not be loaded: ${companyError.message}` }, { status: 400 });
      if (!company) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
      const { data: domainRequest, error: requestError } = await admin.from('company_domain_requests')
        .select('id,status,email_verified_at,dns_verified_at').eq('user_id', company.owner_user_id).maybeSingle();
      if (requestError) return NextResponse.json({ error: `Company domain approval could not be checked: ${requestError.message}` }, { status: 400 });
      if (!domainRequest?.id) {
        return NextResponse.json({ error: 'A company verification request must be submitted first.' }, { status: 409 });
      }
      if (!domainRequest.email_verified_at || !domainRequest.dns_verified_at) {
        return NextResponse.json({ error: 'Organization email and DNS ownership must both be verified before approval.' }, { status: 409 });
      }
      if (!['pending_admin','pending_admin_review','additional_information_required'].includes(domainRequest.status)) {
        return NextResponse.json({ error: 'This request is not awaiting a manual administrator decision.' }, { status: 409 });
      }
      const review = await admin.rpc('review_company_domain_request', {
        request_id: domainRequest.id,
        admin_user_id: user.id,
        decision: 'approved',
        note: 'Approved through the administrator company verification workflow.',
      });
      error = review.error ? { message: review.error.message } : null;
      data = review.error ? null : { approved: true, companyId };
    } else if (body.action === 'review_submission') {
      const role = await getProfileRole(supabase, user.id, user.email);
      if (role !== 'company_member') return NextResponse.json({ error: 'Only a verified assigning company can review submissions.' }, { status: 403 });
      const decision = body.decision === 'approved' || body.decision === 'revision_requested' ? body.decision : null;
      const submissionId = typeof body.submissionId === 'string' ? body.submissionId : '';
      const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : '';
      if (!submissionId || !decision) return NextResponse.json({ error: 'A submission and valid review decision are required.' }, { status: 400 });
      if (feedback.length > 4000) return NextResponse.json({ error: 'Review feedback must be 4,000 characters or fewer.' }, { status: 400 });
      if (decision === 'revision_requested' && !feedback) {
        return NextResponse.json({ error: 'Explain what needs revision before requesting another submission.' }, { status: 400 });
      }

      const { data: submission, error: submissionError } = await supabase
        .from('submissions')
        .select('id,project_id,assignment_id,milestone_id,company_decision')
        .eq('id', submissionId)
        .maybeSingle();
      if (submissionError) return NextResponse.json({ error: `Submission could not be checked: ${submissionError.message}` }, { status: 400 });
      if (!submission || !submission.assignment_id || !submission.milestone_id) {
        return NextResponse.json({ error: 'The submission is not linked to an active project milestone.' }, { status: 404 });
      }
      if (submission.company_decision) return NextResponse.json({ error: 'This submission has already been reviewed. The student must submit a new revision for another review.' }, { status: 409 });

      const [{ data: company, error: companyError }, { data: assignment, error: assignmentError }, { data: project, error: projectError }] = await Promise.all([
        supabase.from('companies').select('id').eq('owner_user_id', user.id).eq('verified', true).maybeSingle(),
        supabase.from('project_assignments').select('id,company_id,company_user_id').eq('id', submission.assignment_id).maybeSingle(),
        supabase.from('projects').select('id,project_source,is_industry,company_user_id,company_id').eq('id', submission.project_id).maybeSingle(),
      ]);
      const authorizationError = companyError || assignmentError || projectError;
      if (authorizationError) return NextResponse.json({ error: `Review authorization could not be checked: ${authorizationError.message}` }, { status: 400 });
      if (!company || !assignment || !project
        || project.project_source !== 'company'
        || !project.is_industry
        || assignment.company_user_id !== user.id
        || assignment.company_id !== company.id
        || project.company_user_id !== user.id
        || project.company_id !== company.id
      ) {
        return NextResponse.json({ error: 'Only the verified company that assigned this project can review its submissions.' }, { status: 403 });
      }

      const result = await supabase.from('submissions').update({
        company_decision: decision,
        company_feedback: feedback,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        status: decision,
      }).eq('id', submissionId).is('company_decision', null).select().single();
      data = result.data; error = result.error;
    } else {
      return NextResponse.json({ error: 'Unsupported backend action.' }, { status: 400 });
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, message: 'Your change was saved.' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Backend request failed.' }, { status: 500 });
  }
}
