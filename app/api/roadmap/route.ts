import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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

async function getStudent(req: Request) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Sign in to load your roadmap.', status: 401 as const };
  const supabase = getAuthedClient(token);
  if (!supabase) return { error: 'Supabase is not configured on this server.', status: 503 as const };
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return { error: 'Your session is invalid or expired. Sign in again.', status: 401 as const };
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role,career_goal,preferred_language,learning_personalization_enabled').eq('id', user.id).maybeSingle();
  if (profileError) return { error: `Could not load your profile: ${profileError.message}`, status: 400 as const };
  if (!profile) return { error: 'Your BuildBridge profile is missing.', status: 409 as const };
  if (profile.role !== 'student') return { error: 'Personalized roadmaps are available to student accounts only.', status: 403 as const };
  return { supabase, user, profile };
}

function stringList(value: unknown, maximum: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean).map((item) => item.slice(0, 120)))].slice(0, maximum);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function geminiErrorInfo(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(rawMessage);
    if (isRecord(parsed)) {
      detail = isRecord(parsed.error) ? parsed.error : parsed;
    }
  } catch {
    if (isRecord(error)) detail = error;
  }
  const code = typeof detail.code === 'number' ? detail.code : undefined;
  const status = typeof detail.status === 'string' ? detail.status : '';
  if (code === 503 || status === 'UNAVAILABLE') {
    return { statusCode: 503, message: 'Gemini is temporarily busy. Your starter roadmap is still available; please try generating again in a few minutes.' };
  }
  if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
    return { statusCode: 429, message: 'Gemini has reached its current request limit. Your starter roadmap is still available; try again later.' };
  }
  if (code === 401 || code === 403 || status === 'PERMISSION_DENIED') {
    return { statusCode: 503, message: 'Gemini configuration was rejected. Check the API key and model access in your server environment.' };
  }
  const message = typeof detail.message === 'string' ? detail.message : rawMessage;
  return { statusCode: 502, message: message.length > 500 ? 'Gemini roadmap generation failed. Please try again later.' : message };
}

class PublicGeminiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function generateWithRetry(ai: GoogleGenAI, model: string, contents: string) {
  try {
    return await ai.models.generateContent({ model, contents });
  } catch (firstError) {
    const first = geminiErrorInfo(firstError);
    if (first.statusCode !== 503) throw new PublicGeminiError(first.message, first.statusCode);
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      return await ai.models.generateContent({ model, contents });
    } catch (retryError) {
      const retry = geminiErrorInfo(retryError);
      throw new PublicGeminiError(retry.message, retry.statusCode);
    }
  }
}

export async function GET(req: Request) {
  try {
    const auth = await getStudent(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.supabase.from('student_roadmaps')
      .select('id,career_goal,steps,updated_at')
      .eq('student_user_id', auth.user.id)
      .eq('career_goal', auth.profile.career_goal || 'Data Analyst')
      .maybeSingle();
    if (error) return NextResponse.json({ error: `Could not load your saved roadmap: ${error.message}` }, { status: 400 });
    return NextResponse.json({ roadmap: data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Roadmap request failed.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getStudent(req);
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'AI roadmap generation needs GEMINI_API_KEY in the server environment.' }, { status: 503 });
    }

    const body = await req.json();
    if (body.action !== 'generate') return NextResponse.json({ error: 'Unsupported roadmap action.' }, { status: 400 });
    const [{ data: skills, error: skillsError }, { data: activity, error: activityError }] = await Promise.all([
      auth.supabase.from('skill_evidence').select('skill,status').eq('student_user_id', auth.user.id),
      auth.profile.learning_personalization_enabled === false
        ? Promise.resolve({ data: [], error: null })
        : auth.supabase.from('learning_activity').select('topic,action').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }).limit(100),
    ]);
    const { data: courseworkMaps, error: courseworkError } = await auth.supabase.from('coursework_maps')
      .select('course_name,career_goal,summary,concepts,mapped_skills').eq('student_user_id', auth.user.id).order('created_at', { ascending: false }).limit(5);
    if (skillsError) return NextResponse.json({ error: `Could not load skill evidence: ${skillsError.message}` }, { status: 400 });
    if (activityError) return NextResponse.json({ error: `Could not load learning history: ${activityError.message}` }, { status: 400 });
    if (courseworkError) return NextResponse.json({ error: `Could not load your coursework maps: ${courseworkError.message}` }, { status: 400 });

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await generateWithRetry(
      ai,
      process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      `Create a practical 5-8 step learning roadmap for this student. Write in language code "${auth.profile.preferred_language || 'en'}". Return only valid JSON with this shape: {"steps":[{"title":"...","explanation":"...","requiredSkills":["..."],"learningTopics":["..."],"completionCriteria":"...","resourceSearchQueries":["..."]}]}. Do not invent video IDs, titles, creators, view counts, certificates, or completed skills. Use only the evidence below to distinguish existing skills from gaps. Each step must have 1-5 concise required skills, 1-4 specific learning topics, and measurable completion criteria. Do not claim a company assignment or accreditation. Career goal: ${auth.profile.career_goal || 'Data Analyst'}. Coursework maps (student-provided source material): ${JSON.stringify(courseworkMaps || [])}. Prior skill evidence: ${JSON.stringify(skills || [])}. Learning activity: ${JSON.stringify(activity || [])}. Use the coursework concepts to select relevant skill foundations, but do not treat syllabus coverage as proof of skill mastery. Use the skill evidence to distinguish what is already practiced, demonstrated or company-verified.`,
    );
    const generated = response.text?.trim();
    if (!generated) return NextResponse.json({ error: 'Gemini returned an empty roadmap.' }, { status: 502 });
    const jsonText = generated.slice(generated.indexOf('{'), generated.lastIndexOf('}') + 1);
    let parsed: { steps?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Gemini returned a roadmap that could not be validated. Please try again.' }, { status: 502 });
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length < 3) {
      return NextResponse.json({ error: 'Gemini did not return enough roadmap steps.' }, { status: 502 });
    }
    const steps = parsed.steps.slice(0, 8).map((step: any) => {
      const title = String(step?.title || '').trim().slice(0, 160);
      const explanation = String(step?.explanation || '').trim().slice(0, 1000);
      const completionCriteria = String(step?.completionCriteria || '').trim().slice(0, 500);
      const requiredSkills = stringList(step?.requiredSkills, 5);
      const learningTopics = stringList(step?.learningTopics, 4);
      const resourceSearchQueries = stringList(step?.resourceSearchQueries, 4);
      if (!title || !explanation || !completionCriteria || !requiredSkills.length || !learningTopics.length) {
        throw new Error('Gemini returned an incomplete roadmap step. Please try again.');
      }
      return { title, explanation, requiredSkills, learningTopics, completionCriteria, resourceSearchQueries };
    });

    const { data: roadmap, error: saveError } = await auth.supabase.from('student_roadmaps')
      .upsert({
        student_user_id: auth.user.id,
        career_goal: auth.profile.career_goal || 'Data Analyst',
        steps,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_user_id,career_goal' })
      .select('id,career_goal,steps,updated_at').single();
    if (saveError) return NextResponse.json({ error: `Generated roadmap could not be saved: ${saveError.message}` }, { status: 400 });
    return NextResponse.json({ roadmap }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof PublicGeminiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Roadmap generation failed.' }, { status: 500 });
  }
}
