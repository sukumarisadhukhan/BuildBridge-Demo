import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data, error } = await supabase.from('notifications')
    .select('id,kind,title,body,payload,read_at,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: `Notifications could not be loaded: ${error.message}` }, { status: 400 });
  return NextResponse.json({ notifications: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json() as { id?: string; all?: boolean };
  let query = supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id);
  if (body.id) query = query.eq('id', body.id);
  else if (body.all) query = query.is('read_at', null);
  else return NextResponse.json({ error: 'Specify a notification id or all=true.' }, { status: 400 });
  const { error } = await query;
  if (error) return NextResponse.json({ error: `Notification state could not be updated: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true });
}
