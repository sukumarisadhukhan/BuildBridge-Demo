import { NextResponse } from 'next/server';
import { authenticateRequest, getProfileRole } from '@/lib/api-auth';

function cleanText(value: unknown, maximum: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maximum)
    : '';
}

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
  if (role !== 'student') return NextResponse.json({ error: 'Playback sessions are available to student accounts only.' }, { status: 403 });
  const { data, error } = await auth.supabase
    .from('learning_playback_sessions')
    .select('*')
    .eq('student_user_id', auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: `Playback session could not be loaded: ${error.message}` }, { status: 400 });
  return NextResponse.json({ data: data || null }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PUT(req: Request) {
  const auth = await authenticateRequest(req);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const role = await getProfileRole(auth.supabase, auth.user.id, auth.user.email);
  if (role !== 'student') return NextResponse.json({ error: 'Playback sessions are available to student accounts only.' }, { status: 403 });
  const body = await req.json() as Record<string, unknown>;
  const videoId = cleanText(body.videoId, 20);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'A valid YouTube video ID is required.' }, { status: 400 });
  }
  const title = cleanText(body.title, 300);
  if (!title) return NextResponse.json({ error: 'Video title is required.' }, { status: 400 });
  const positionSeconds = Number(body.positionSeconds);
  const durationSeconds = body.durationSeconds === null || body.durationSeconds === undefined ? null : Number(body.durationSeconds);
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    return NextResponse.json({ error: 'Playback position is invalid.' }, { status: 400 });
  }
  if (durationSeconds !== null && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
    return NextResponse.json({ error: 'Video duration is invalid.' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('learning_playback_sessions')
    .upsert({
      student_user_id: auth.user.id,
      video_id: videoId,
      title,
      channel: cleanText(body.channel, 200) || null,
      thumbnail: cleanText(body.thumbnail, 1000) || null,
      topic: cleanText(body.topic, 100) || null,
      position_seconds: positionSeconds,
      duration_seconds: durationSeconds,
      completed: body.completed === true,
      active_filters: body.activeFilters && typeof body.activeFilters === 'object' ? body.activeFilters : {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_user_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: `Playback session could not be saved: ${error.message}` }, { status: 400 });
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
}
