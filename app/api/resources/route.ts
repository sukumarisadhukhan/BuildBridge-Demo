import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfiguration } from '@/lib/supabase-config';

function getAuthedClient(token: string) {
  const configuration = getSupabaseConfiguration();
  if (configuration.error) return null;
  return createClient(configuration.url, configuration.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function authenticate(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Sign in to load video recommendations.', status: 401 as const };
  const supabase = getAuthedClient(token);
  if (!supabase) return { error: 'Supabase is not configured on this server.', status: 503 as const };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Your session is invalid or expired. Sign in again.', status: 401 as const };
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('role,career_goal,preferred_language,learning_personalization_enabled').eq('id', user.id).maybeSingle();
  if (profileError) return { error: `Could not load your profile: ${profileError.message}`, status: 400 as const };
  if (!profile) return { error: 'Your BuildBridge profile is missing.', status: 409 as const };
  if (profile.role !== 'student') return { error: 'Video recommendations are available to student accounts only.', status: 403 as const };
  return { supabase, user, profile };
}

function youtubeErrorMessage(payload: any) {
  const reason = payload?.error?.errors?.[0]?.reason;
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    return 'YouTube recommendations have reached their daily API quota. Try again later.';
  }
  if (reason === 'keyInvalid' || reason === 'ipRefererBlocked') {
    return 'The YouTube API key is invalid or restricted for this server. Check its Google Cloud settings.';
  }
  return 'YouTube could not provide video recommendations. Check the API key and YouTube Data API v3 configuration.';
}

function formatDuration(value: string) {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return '';
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  try {
    const auth = await authenticate(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'YouTube recommendations are not configured. Add YOUTUBE_API_KEY to the server environment and restart the app.' }, { status: 503 });
    }

    const url = new URL(req.url);
    const requestedTopic = (url.searchParams.get('topic') || '').trim().slice(0, 100);
    const topics = (url.searchParams.get('topics') || '')
      .split(',')
      .map(topic => topic.trim().slice(0, 60))
      .filter(Boolean)
      .slice(0, 3);
    const careerGoal = String(auth.profile.career_goal || 'Data Analyst').trim().slice(0, 80);
    const searchQuery = [careerGoal, requestedTopic || topics.join(' '), 'tutorial'].filter(Boolean).join(' ');
    const relevanceLanguage = String(auth.profile.preferred_language || 'en').slice(0, 2);
    const useLearningHistory = auth.profile.learning_personalization_enabled !== false;

    const activityQuery = auth.supabase.from('learning_activity')
      .select('video_id,topic,action')
      .eq('student_user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    const bookmarksQuery = auth.supabase.from('learning_bookmarks')
      .select('video_id,title,channel,thumbnail,topic,created_at')
      .eq('student_user_id', auth.user.id)
      .order('created_at', { ascending: false });
    const [activityResult, bookmarksResult] = await Promise.all([activityQuery, bookmarksQuery]);
    if (activityResult.error) return NextResponse.json({ error: `Could not load your learning history: ${activityResult.error.message}` }, { status: 400 });
    if (bookmarksResult.error) return NextResponse.json({ error: `Could not load your saved videos: ${bookmarksResult.error.message}` }, { status: 400 });

    const searchParams = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      type: 'video',
      q: searchQuery,
      maxResults: '25',
      order: 'relevance',
      safeSearch: 'moderate',
      videoEmbeddable: 'true',
      relevanceLanguage,
    });
    const searchResponse = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`, { cache: 'no-store' });
    const searchPayload = await searchResponse.json();
    if (!searchResponse.ok) return NextResponse.json({ error: youtubeErrorMessage(searchPayload) }, { status: searchResponse.status === 403 ? 503 : 502 });

    const searchItems = Array.isArray(searchPayload.items) ? searchPayload.items : [];
    const videoIds = searchItems
      .map((item: any) => item?.id?.videoId)
      .filter((id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id));
    if (!videoIds.length) return NextResponse.json({ resources: [], bookmarks: bookmarksResult.data || [], query: searchQuery });

    const detailsParams = new URLSearchParams({
      key: apiKey,
      part: 'contentDetails,statistics',
      id: videoIds.join(','),
    });
    const detailsResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailsParams}`, { cache: 'no-store' });
    const detailsPayload = await detailsResponse.json();
    if (!detailsResponse.ok) return NextResponse.json({ error: youtubeErrorMessage(detailsPayload) }, { status: detailsResponse.status === 403 ? 503 : 502 });

    const completedVideoIds = new Set((useLearningHistory ? activityResult.data || [] : [])
      .filter(item => item.action === 'completed' && item.video_id)
      .map(item => item.video_id));
    const bookmarkedVideoIds = new Set((bookmarksResult.data || []).map(item => item.video_id));
    const detailsById = new Map((detailsPayload.items || []).map((item: any) => [item.id, item]));
    const resources = searchItems.flatMap((item: any) => {
      const videoId = item?.id?.videoId;
      const details: any = detailsById.get(videoId);
      if (!videoId || !details || completedVideoIds.has(videoId)) return [];
      const snippet = item.snippet || {};
      const thumbnails = snippet.thumbnails || {};
      return [{
        id: videoId,
        videoId,
        title: String(snippet.title || 'YouTube video').slice(0, 300),
        channel: String(snippet.channelTitle || 'YouTube creator').slice(0, 200),
        description: String(snippet.description || '').slice(0, 1000),
        thumbnail: thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || '',
        publishedAt: snippet.publishedAt || null,
        duration: formatDuration(details.contentDetails?.duration || ''),
        views: Number(details.statistics?.viewCount || 0),
        topic: requestedTopic || topics[0] || careerGoal,
        bookmarked: bookmarkedVideoIds.has(videoId),
      }];
    });

    return NextResponse.json(
      { resources, bookmarks: bookmarksResult.data || [], query: searchQuery },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Video recommendations could not be loaded. Check server connectivity and try again.' }, { status: 500 });
  }
}
