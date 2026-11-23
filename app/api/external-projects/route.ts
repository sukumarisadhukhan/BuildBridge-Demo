import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';
import { discoverGithub } from '@/lib/external-discovery/providers/github';
import { matchListing, type StudentEvidence } from '@/lib/external-discovery/matching';

function cleanParam(value: string | null, max = 80) {
  return (value || '').replace(/[^\w\s+\-./#]/g, '').trim().slice(0, max);
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
  if (role !== 'student') return NextResponse.json({ error: 'External project discovery is available to student accounts.' }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.min(10, Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const perPage = 30;
  const sort = url.searchParams.get('sort') === 'relevance' ? 'relevance' : 'newest';
  const provider = (url.searchParams.get('provider') || 'github').toLowerCase();
  if (provider !== 'github') return NextResponse.json({ error: 'Only the GitHub provider is currently integrated.' }, { status: 400 });

  const query = cleanParam(url.searchParams.get('q'));
  const skill = cleanParam(url.searchParams.get('skill'));
  const technology = cleanParam(url.searchParams.get('technology'));
  const language = cleanParam(url.searchParams.get('language'), 40);
  const category = url.searchParams.get('category');
  if (category && category !== 'open_source') {
    return NextResponse.json({ error: 'Competition and project-challenge integrations require authorized provider feeds.' }, { status: 400 });
  }

  const [profileResult, assignmentsResult] = await Promise.all([
    auth.supabase.from('profiles').select('career_goal,profile_skills,coursework,location').eq('id', auth.user.id).maybeSingle(),
    auth.supabase.from('project_assignments').select('status, project:projects(required_skills)').eq('student_user_id', auth.user.id),
  ]);
  if (profileResult.error) return NextResponse.json({ error: 'Your profile could not be loaded for matching.' }, { status: 400 });

  const profile = (profileResult.data || {}) as {
    career_goal?: string | null;
    profile_skills?: unknown;
    coursework?: unknown;
    location?: string | null;
  };
  const projectSkills: string[] = [];
  for (const assignment of assignmentsResult.data || []) {
    const project = Array.isArray(assignment.project) ? assignment.project[0] : assignment.project;
    if (assignment.status === 'completed' || assignment.status === 'approved') {
      for (const skillName of project?.required_skills || []) {
        if (typeof skillName === 'string') projectSkills.push(skillName);
      }
    }
  }

  const evidence: StudentEvidence = {
    careerGoal: typeof profile.career_goal === 'string' ? profile.career_goal : null,
    profileSkills: Array.isArray(profile.profile_skills) ? profile.profile_skills.filter((item: unknown): item is string => typeof item === 'string') : [],
    coursework: Array.isArray(profile.coursework) ? profile.coursework.filter((item: unknown): item is string => typeof item === 'string') : [],
    location: typeof profile.location === 'string' ? profile.location : null,
    demonstratedSkills: projectSkills,
    completedProjectSkills: projectSkills,
  };

  const github = await discoverGithub({ query, skill, technology, language, page, sort });
  const matches: Record<string, ReturnType<typeof matchListing>> = {};
  for (const listing of github.listings) matches[listing.id] = matchListing(listing, evidence);

  return NextResponse.json({
    data: {
      listings: github.listings,
      matches,
      page,
      perPage,
      hasMore: github.hasMore,
      providerStatus: {
        github: github.status,
        ...(github.message ? { githubMessage: github.message } : {}),
      },
    },
  }, {
    headers: {
      'Cache-Control': 'private, s-maxage=1800, stale-while-revalidate=300',
    },
  });
}
