import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

function cleanText(value: unknown, maximum = 500) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maximum) : '';
}

function parseModelJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || value.slice(value.indexOf('{'), value.lastIndexOf('}') + 1);
  if (!source || source[0] !== '{') throw new Error('The coursework analysis returned an unreadable structure. Please try a clearer PDF or text file.');
  return JSON.parse(source) as Record<string, unknown>;
}

function normalizeItems(raw: unknown, limit: number, fields: string[]) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, limit).map(item => {
    const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const output: Record<string, string> = {};
    for (const field of fields) output[field] = cleanText(source[field], field === 'explanation' || field === 'description' ? 700 : 180);
    return output;
  }).filter(item => Object.values(item).some(Boolean));
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Coursework mapping is available to student accounts only.' }, { status: 403 });
  const { data, error } = await supabase.from('coursework_maps')
    .select('id,source_file_name,course_name,career_goal,summary,concepts,mapped_skills,project_suggestions,created_at')
    .eq('student_user_id', user.id).order('created_at', { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: `Coursework history could not be loaded: ${error.message}` }, { status: 400 });
  const mapIds = (data || []).map(item => item.id);
  const [quizzesResult, attemptsResult, certificatesResult] = mapIds.length ? await Promise.all([
    supabase.from('coursework_quizzes').select('id,coursework_map_id,course_name,questions,created_at').eq('student_user_id', user.id).in('coursework_map_id', mapIds),
    supabase.from('coursework_quiz_attempts').select('id,quiz_id,score,passed,feedback,attempted_at').eq('student_user_id', user.id).order('attempted_at', { ascending: false }),
    supabase.from('theory_certificates').select('id,quiz_id,coursework_map_id,course_name,recipient_name,certificate_code,score,issued_at').eq('student_user_id', user.id).in('coursework_map_id', mapIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const readError = quizzesResult.error || attemptsResult.error || certificatesResult.error;
  if (readError) return NextResponse.json({ error: `Coursework assessments could not be loaded: ${readError.message}` }, { status: 400 });
  const maps = (data || []).map(map => {
    const quiz = (quizzesResult.data || []).find(item => item.coursework_map_id === map.id);
    return {
      ...map,
      quiz: quiz ? {
        ...quiz,
        attempts: (attemptsResult.data || []).filter(attempt => attempt.quiz_id === quiz.id),
        certificate: (certificatesResult.data || []).find(certificate => certificate.quiz_id === quiz.id) || null,
      } : null,
    };
  });
  return NextResponse.json({ maps }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role,career_goal,preferred_language,learning_personalization_enabled,profile_skills,coursework,institution,degree,department')
    .eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: `Profile context could not be loaded: ${profileError.message}` }, { status: 400 });
  if (!profile || profile.role !== 'student') return NextResponse.json({ error: 'Coursework mapping is available to student accounts only.' }, { status: 403 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'Coursework mapping requires GEMINI_API_KEY on the server.' }, { status: 503 });

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a syllabus or assignment file first.' }, { status: 400 });
    if (!file.size || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'The file must be between 1 byte and 4 MB.' }, { status: 400 });
    const mime = file.type.toLowerCase();
    const extension = file.name.toLowerCase().split('.').pop() || '';
    const isPdf = mime === 'application/pdf' || extension === 'pdf';
    const isText = mime.startsWith('text/') || ['txt', 'md', 'csv'].includes(extension);
    if (!isPdf && !isText) return NextResponse.json({ error: 'Upload a PDF or a plain-text syllabus/assignment (.txt, .md or .csv). Word files and password-protected PDFs are not supported yet.' }, { status: 415 });

    const careerGoal = cleanText(form.get('careerGoal') || profile.career_goal || 'Career exploration', 120);
    const language = cleanText(profile.preferred_language || 'en', 12);
    const userContext = {
      institution: profile.institution,
      degree: profile.degree,
      department: profile.department,
      existingSkills: profile.profile_skills || [],
      existingCoursework: profile.coursework || [],
      careerGoal,
    };
    const prompt = `Analyze this student's syllabus or assignment as a coursework-first learning input for BuildBridge. Use response language ${language}. Career goal: ${careerGoal}. Student academic context: ${JSON.stringify(userContext)}. Return only valid JSON with this shape: {"courseName":"...","summary":"...","concepts":[{"name":"...","explanation":"...","priority":"high|medium|low","linkedSkills":["..."],"careerRelevance":"..."}],"mappedSkills":[{"skill":"...","whyItMatters":"...","nextAction":"..."}],"projectSuggestions":[{"title":"...","description":"...","skills":["..."],"evidenceIdea":"..."}],"knowledgeCheck":[{"question":"...","concept":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"..."}]}. Extract at most 15 concrete concepts, 12 transferable skills and 4 realistic small project ideas. Add 5 fair multiple-choice knowledge-check questions about concepts explicitly taught in the supplied material; each must have exactly 4 options and one unambiguous correctIndex from 0 to 3. Avoid trivia and avoid questions whose answer is not present or inferable from the supplied material. Prefer concepts explicitly present in the material; mark uncertainty rather than inventing details. Do not claim that the student has demonstrated or mastered a skill from reading a syllabus. Suggest evidence-producing activities that can be linked to BuildBridge projects. Keep explanations useful but concise. The source document follows.`;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const contents = isPdf
      ? [
          { inlineData: { mimeType: 'application/pdf', data: Buffer.from(await file.arrayBuffer()).toString('base64') } },
          { text: prompt },
        ]
      : `${prompt}\n\n${(await file.text()).slice(0, 100000)}`;
    const response = await ai.models.generateContent({ model: MODEL, contents });
    const result = parseModelJson(response.text || '');
    const courseName = cleanText(result.courseName || file.name.replace(/\.[^.]+$/, ''), 160) || 'Coursework upload';
    const conceptsBase = normalizeItems(result.concepts, 15, ['name', 'explanation', 'priority', 'careerRelevance']);
    const concepts = conceptsBase.map((item, index) => ({
      ...item,
      linkedSkills: Array.isArray((result.concepts as any[])?.[index]?.linkedSkills)
        ? (result.concepts as any[])[index].linkedSkills.filter((skill: unknown) => typeof skill === 'string').map((skill: string) => cleanText(skill, 80)).filter(Boolean).slice(0, 8)
        : [],
    }));
    const mappedSkills = normalizeItems(result.mappedSkills, 12, ['skill', 'whyItMatters', 'nextAction']);
    const projectSuggestions = normalizeItems(result.projectSuggestions, 4, ['title', 'description', 'evidenceIdea']);
    const rawQuestions = Array.isArray(result.knowledgeCheck) ? result.knowledgeCheck.slice(0, 8) as any[] : [];
    const normalizedQuestions = rawQuestions.map(item => ({
      question: cleanText(item?.question, 600),
      concept: cleanText(item?.concept, 120),
      options: Array.isArray(item?.options) ? item.options.filter((option: unknown) => typeof option === 'string').map((option: string) => cleanText(option, 240)).slice(0, 4) : [],
      correctIndex: Number(item?.correctIndex),
      explanation: cleanText(item?.explanation, 700),
    })).filter(item => item.question && item.options.length === 4 && Number.isInteger(item.correctIndex) && item.correctIndex >= 0 && item.correctIndex <= 3 && item.explanation);
    const quizQuestions = normalizedQuestions.map(({ question, concept, options }) => ({ question, concept, options }));
    const quizAnswerIndexes = normalizedQuestions.map(item => item.correctIndex);
    const quizExplanations = normalizedQuestions.map(item => item.explanation);
    // Keep a separate, bounded list of skills for each suggested project.
    const rawProjectSuggestions = Array.isArray(result.projectSuggestions) ? result.projectSuggestions.slice(0, 4) as any[] : [];
    const fullProjectSuggestions = projectSuggestions.map((item, index) => ({
      ...item,
      skills: Array.isArray(rawProjectSuggestions[index]?.skills) ? rawProjectSuggestions[index].skills.filter((skill: unknown) => typeof skill === 'string').map((skill: string) => cleanText(skill, 80)).filter(Boolean).slice(0, 8) : [],
    }));
    if (!concepts.length && !mappedSkills.length) return NextResponse.json({ error: 'No clear concepts were found. Try a text-based syllabus or a sharper, unlocked PDF.' }, { status: 422 });

    const summary = cleanText(result.summary, 1200);
    const { data: saved, error: saveError } = await supabase.from('coursework_maps').insert({
      student_user_id: user.id,
      source_file_name: cleanText(file.name, 180) || 'coursework-upload',
      course_name: courseName,
      career_goal: careerGoal,
      summary,
      concepts,
      mapped_skills: mappedSkills,
      project_suggestions: fullProjectSuggestions,
    }).select('id,source_file_name,course_name,career_goal,summary,concepts,mapped_skills,project_suggestions,created_at').single();
    if (saveError || !saved) return NextResponse.json({ error: `Coursework was analyzed, but its structured results could not be saved: ${saveError?.message || 'No record returned.'}` }, { status: 400 });

    let quiz: Record<string, unknown> | null = null;
    let quizWarning = '';
    if (quizQuestions.length >= 4 && quizQuestions.length === quizAnswerIndexes.length) {
      const admin = createAdminClient();
      if (!admin) {
        quizWarning = 'Coursework was mapped, but knowledge checks need SUPABASE_SERVICE_ROLE_KEY on the server.';
      } else {
        const { data: quizRow, error: quizError } = await admin.from('coursework_quizzes').insert({
          coursework_map_id: saved.id,
          student_user_id: user.id,
          course_name: courseName,
          questions: quizQuestions,
        }).select('id,coursework_map_id,course_name,questions,created_at').single();
        if (quizError || !quizRow) {
          quizWarning = `Coursework was mapped, but the knowledge check could not be saved: ${quizError?.message || 'No quiz record returned.'}`;
        } else {
          const { error: keyError } = await admin.from('coursework_quiz_answer_keys').insert({
            quiz_id: quizRow.id,
            correct_indexes: quizAnswerIndexes,
            explanations: quizExplanations,
          });
          if (keyError) {
            await admin.from('coursework_quizzes').delete().eq('id', quizRow.id);
            quizWarning = `Coursework was mapped, but the knowledge check could not be activated: ${keyError.message}`;
          } else {
            quiz = { ...quizRow, attempts: [], certificate: null };
          }
        }
      }
    } else {
      quizWarning = 'Coursework was mapped, but the document did not support enough reliable questions for a knowledge check.';
    }
    return NextResponse.json({ map: { ...saved, quiz }, summary, quizWarning }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Coursework could not be analyzed. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = cleanText(body.id, 80);
  if (!id) return NextResponse.json({ error: 'Choose a coursework record to delete.' }, { status: 400 });
  const { error } = await supabase.from('coursework_maps').delete().eq('id', id).eq('student_user_id', user.id);
  if (error) return NextResponse.json({ error: `Coursework analysis could not be deleted: ${error.message}` }, { status: 400 });
  return NextResponse.json({ ok: true });
}
