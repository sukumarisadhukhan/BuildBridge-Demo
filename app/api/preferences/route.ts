import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const supportedLanguages = new Set(['en', 'hi', 'ta', 'te', 'bn', 'mr', 'es', 'fr', 'de', 'pt', 'ar', 'ja']);
const preferenceFields = ['email_enabled', 'project_updates', 'deadline_reminders', 'opportunity_updates', 'learning_updates'] as const;
const companyPreferenceFields = ['company_submission_updates','company_milestone_updates','company_applicant_updates','company_verification_updates','company_in_app_updates'] as const;
const adminPreferenceFields = ['admin_company_verifications','admin_ai_incidents','admin_database_errors','admin_certificate_errors','admin_email_failures'] as const;
const profileTextFields = {
  bio: 1000,
  education_level: 120,
  institution: 180,
  field_of_study: 160,
  degree: 120,
  department: 160,
  academic_year: 80,
  location: 160,
} as const;
const profileUrlFields = ['linkedin_url', 'github_url', 'portfolio_url', 'resume_url'] as const;

function validHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const [profileResult, preferenceResult] = await Promise.all([
    supabase.from('profiles').select('role,preferred_language,learning_personalization_enabled,bio,education_level,institution,field_of_study,profile_skills,location,degree,department,academic_year,graduation_year,cgpa,coursework,linkedin_url,github_url,portfolio_url,resume_url').eq('id', user.id).maybeSingle(),
    supabase.from('notification_preferences').select('email_enabled,project_updates,deadline_reminders,opportunity_updates,learning_updates,company_submission_updates,company_milestone_updates,company_applicant_updates,company_verification_updates,company_in_app_updates,admin_company_verifications,admin_ai_incidents,admin_database_errors,admin_certificate_errors,admin_email_failures').eq('user_id', user.id).maybeSingle(),
  ]);
  let notifications: Record<string, unknown> | null =
    preferenceResult.data as Record<string, unknown> | null;
  if (preferenceResult.error) {
    const basePreferenceResult = await supabase
      .from('notification_preferences')
      .select('email_enabled,project_updates,deadline_reminders,opportunity_updates,learning_updates')
      .eq('user_id', user.id)
      .maybeSingle();
    if (basePreferenceResult.error) {
      return NextResponse.json({ error: `Preferences could not be loaded: ${basePreferenceResult.error.message}` }, { status: 400 });
    }
    notifications = basePreferenceResult.data as Record<string, unknown> | null;
  }
  if (profileResult.error) return NextResponse.json({ error: `Preferences could not be loaded: ${profileResult.error.message}` }, { status: 400 });
  return NextResponse.json({
    profile: profileResult.data,
    notifications: notifications || { email_enabled: true, project_updates: true, deadline_reminders: true, opportunity_updates: true, learning_updates: true },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: profileRole, error: roleError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (roleError) return NextResponse.json({ error: 'Your account role could not be verified.' }, { status: 400 });
  const role = profileRole?.role;
  const body = await request.json() as Record<string, unknown>;

  const profile: Record<string, unknown> = {};
  if (role !== 'student') {
    if (body.preferred_language !== undefined || body.learning_personalization_enabled !== undefined
      || body.coursework !== undefined || body.profile_skills !== undefined
      || body.education_level !== undefined || body.institution !== undefined
      || body.field_of_study !== undefined || body.degree !== undefined
      || body.department !== undefined || body.academic_year !== undefined
      || body.graduation_year !== undefined || body.cgpa !== undefined) {
      return NextResponse.json({ error: 'Student education preferences are not available for this account type.' }, { status: 403 });
    }
  }
  if (typeof body.preferred_language === 'string') {
    if (!supportedLanguages.has(body.preferred_language)) return NextResponse.json({ error: 'Choose a supported language.' }, { status: 400 });
    profile.preferred_language = body.preferred_language;
  }
  if (typeof body.learning_personalization_enabled === 'boolean') profile.learning_personalization_enabled = body.learning_personalization_enabled;

  for (const [field, maximum] of Object.entries(profileTextFields)) {
    if (typeof body[field] === 'string') profile[field] = body[field].trim().slice(0, maximum) || null;
  }
  for (const field of profileUrlFields) {
    if (typeof body[field] === 'string') {
      const value = body[field].trim();
      if (value && (value.length > 500 || !validHttpUrl(value))) {
        return NextResponse.json({ error: `Enter a valid HTTP or HTTPS address for ${field.replace('_url', '').replace('_', ' ')}.` }, { status: 400 });
      }
      profile[field] = value || null;
    }
  }

  if (body.graduation_year !== undefined) {
    const raw = body.graduation_year;
    if (raw === null || raw === '') profile.graduation_year = null;
    else {
      const year = Number(raw);
      if (!Number.isInteger(year) || year < 1950 || year > 2200) return NextResponse.json({ error: 'Graduation year must be a valid year between 1950 and 2200.' }, { status: 400 });
      profile.graduation_year = year;
    }
  }
  if (body.cgpa !== undefined) {
    const raw = body.cgpa;
    if (raw === null || raw === '') profile.cgpa = null;
    else {
      const grade = Number(raw);
      if (!Number.isFinite(grade) || grade < 0 || grade > 100) return NextResponse.json({ error: 'Enter a valid GPA or percentage between 0 and 100.' }, { status: 400 });
      profile.cgpa = grade;
    }
  }
  if (Array.isArray(body.coursework)) profile.coursework = body.coursework
    .filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 160)).filter(Boolean).slice(0, 30);
  if (Array.isArray(body.profile_skills)) profile.profile_skills = body.profile_skills
    .filter((item): item is string => typeof item === 'string').map(item => item.trim().slice(0, 50)).filter(Boolean).slice(0, 30);

  const notifications: Record<string, boolean> = {};
  if (role === 'student') {
    for (const field of preferenceFields) {
      if (typeof body[field] === 'boolean') notifications[field] = body[field] as boolean;
    }
  } else if (role === 'company_member') {
    for (const field of [...preferenceFields, ...companyPreferenceFields] as readonly string[]) {
      if (typeof body[field] === 'boolean') notifications[field] = body[field] as boolean;
    }
  } else if (role === 'admin') {
    for (const field of ['email_enabled','project_updates','opportunity_updates', ...adminPreferenceFields] as const) {
      if (typeof body[field] === 'boolean') notifications[field] = body[field] as boolean;
    }
  }
  if (Object.keys(profile).length) {
    const { error } = await supabase.from('profiles').update(profile).eq('id', user.id);
    if (error) return NextResponse.json({ error: `Profile preferences could not be saved: ${error.message}` }, { status: 400 });
  }
  if (Object.keys(notifications).length) {
    const { error } = await supabase.from('notification_preferences').upsert({ user_id: user.id, ...notifications, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: `Notification preferences could not be saved: ${error.message}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
