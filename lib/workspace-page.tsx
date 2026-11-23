import Link from 'next/link';
import { redirect } from 'next/navigation';
import WorkspaceApp from '@/components/WorkspaceApp';
import { getProfileRole } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';

type Role = 'student' | 'company_member' | 'admin';

const dashboardForRole: Record<Role, string> = {
  student: '/student/dashboard',
  company_member: '/company/dashboard',
  admin: '/admin',
};

export async function WorkspacePage({ requiredRole, companyPortal }: { requiredRole?: Role; companyPortal?: boolean }) {
  const supabase = await createClient();
  if (!supabase) {
    return <main className="auth-loading"><h1>BuildBridge is not configured</h1><p>Add Supabase public URL and anon/publishable key to the server environment.</p></main>;
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/auth/sign-in');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,career_goal,phone_number,avatar_path')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    return <main className="auth-loading"><h1>Could not load your workspace</h1><p>{profileError.message}</p><Link href="/auth/sign-in">Return to sign in</Link></main>;
  }
  if (!profile) {
    return <main className="auth-loading"><h1>Your profile is not ready</h1><p>Run the documented BuildBridge Supabase auth repair migration, then sign in again.</p><Link href="/auth/sign-in">Return to sign in</Link></main>;
  }
  if (!['student', 'company_member', 'admin'].includes(profile.role)) {
    return <main className="auth-loading"><h1>Your account role is not available</h1><p>Contact the BuildBridge administrator to review your account.</p><Link href="/">Return to BuildBridge</Link></main>;
  }

  const role = profile.role as Role;
  if (role === 'admin' && await getProfileRole(supabase, user.id, user.email) !== 'admin') {
    return <main className="auth-loading"><h1>Administrator access is unavailable</h1><p>This account does not match the confirmed, provisioned platform owner.</p><Link href="/">Return to BuildBridge</Link></main>;
  }
  if (requiredRole && role !== requiredRole) redirect(dashboardForRole[role]);

  return <WorkspaceApp initialProfile={{ ...profile, role }} companyPortal={companyPortal} />;
}