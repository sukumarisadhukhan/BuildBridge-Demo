import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseConfiguration, supabaseConfigurationMessage } from '@/lib/supabase-config';

type AuthenticatedRequest = {
  supabase: SupabaseClient;
  user: User;
};

type AuthenticationError = {
  error: string;
  status: number;
};

export async function authenticateRequest(req: Request): Promise<AuthenticatedRequest | AuthenticationError> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Authentication required.', status: 401 };

  const configuration = getSupabaseConfiguration();
  if (configuration.error) return { error: supabaseConfigurationMessage(configuration.error), status: 503 };

  const supabase = createClient(configuration.url, configuration.key, {
    auth: { flowType: 'implicit', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Your session is invalid or expired. Sign in again.', status: 401 };
  return { supabase, user };
}

export async function getProfileRole(supabase: SupabaseClient, userId: string, authenticatedEmail?: string | null): Promise<string | null> {
  const { data, error } = await supabase.from('profiles').select('role,email').eq('id', userId).maybeSingle();
  if (error) throw new Error(`Could not verify your BuildBridge role: ${error.message}`);
  if (data?.role === 'admin') {
    const ownerEmail = process.env.ADMIN_OWNER_EMAIL?.trim().toLowerCase();
    if (!ownerEmail || !data.email || !authenticatedEmail
      || data.email.toLowerCase() !== ownerEmail
      || authenticatedEmail.toLowerCase() !== ownerEmail) return null;
    const admin = createAdminClient();
    if (!admin) return null;
    const [ownerResult, authResult] = await Promise.all([
      admin.from('platform_admin_owner').select('owner_user_id,owner_email').eq('singleton', true).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    const owner = ownerResult.data;
    const confirmedUser = authResult.data.user;
    if (ownerResult.error || authResult.error || !owner || !confirmedUser
      || owner.owner_user_id !== userId
      || owner.owner_email.trim().toLowerCase() !== ownerEmail
      || confirmedUser.id !== userId
      || !confirmedUser.email_confirmed_at
      || confirmedUser.email?.trim().toLowerCase() !== ownerEmail) return null;
  }
  return data?.role || null;
}
