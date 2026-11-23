import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Theory knowledge checks are available to student accounts only.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const quizId = typeof body.quizId === 'string' ? body.quizId.trim() : '';
  const rawAnswers: unknown[] = Array.isArray(body.answers) ? body.answers : [];
  if (!quizId) return NextResponse.json({ error: 'Choose a knowledge check first.' }, { status: 400 });
  const { data: quiz, error: quizError } = await supabase.from('coursework_quizzes')
    .select('id,coursework_map_id,course_name,questions').eq('id', quizId).eq('student_user_id', user.id).maybeSingle();
  if (quizError) return NextResponse.json({ error: `Knowledge check could not be loaded: ${quizError.message}` }, { status: 400 });
  if (!quiz) return NextResponse.json({ error: 'This knowledge check is not available to your account.' }, { status: 404 });
  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const answers = rawAnswers.filter((answer): answer is number => typeof answer === 'number' && Number.isInteger(answer) && answer >= 0 && answer <= 3);
  if (questions.length < 4 || rawAnswers.length !== questions.length || answers.length !== rawAnswers.length) {
    return NextResponse.json({ error: `Answer all ${questions.length} questions before submitting.` }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'Knowledge check grading requires SUPABASE_SERVICE_ROLE_KEY on the server.' }, { status: 503 });
  const { data: answerKey, error: keyError } = await admin.from('coursework_quiz_answer_keys')
    .select('correct_indexes,explanations').eq('quiz_id', quizId).maybeSingle();
  if (keyError) return NextResponse.json({ error: `The answer key could not be checked: ${keyError.message}` }, { status: 500 });
  if (!answerKey || !Array.isArray(answerKey.correct_indexes) || answerKey.correct_indexes.length !== questions.length) {
    return NextResponse.json({ error: 'This knowledge check is incomplete. Generate a new coursework map and try again.' }, { status: 409 });
  }

  const correct = answerKey.correct_indexes.map((value: unknown) => Number(value));
  const correctCount = answers.reduce((count: number, answer: number, index: number) => count + (answer === correct[index] ? 1 : 0), 0);
  const score = Math.round((correctCount / questions.length) * 10000) / 100;
  const passed = score >= 80;
  const feedback = questions.map((question: any, index: number) => ({
    question: String(question.question || ''),
    concept: String(question.concept || ''),
    selectedIndex: answers[index],
    correctIndex: correct[index],
    correctOption: Array.isArray(question.options) ? question.options[correct[index]] : '',
    correct: answers[index] === correct[index],
    explanation: Array.isArray(answerKey.explanations) ? String(answerKey.explanations[index] || '') : '',
  }));
  const { data: attempt, error: attemptError } = await admin.from('coursework_quiz_attempts').insert({
    quiz_id: quizId,
    student_user_id: user.id,
    selected_indexes: answers,
    score,
    passed,
    feedback,
  }).select('id,score,passed,attempted_at').single();
  if (attemptError || !attempt) return NextResponse.json({ error: `Your result could not be saved: ${attemptError?.message || 'No attempt record returned.'}` }, { status: 500 });

  let certificate = null;
  if (passed) {
    const code = `BBT-${randomBytes(8).toString('hex').toUpperCase()}`;
    if (!profile?.full_name?.trim()) {
      return NextResponse.json({ attempt, correctCount, totalQuestions: questions.length, feedback, passed: true, certificate: null, message: 'You passed the theory check. Add your full name to your BuildBridge profile before the certificate can be issued.' });
    }
    const { data: issued, error: certificateError } = await admin.from('theory_certificates').upsert({
      quiz_id: quizId,
      coursework_map_id: quiz.coursework_map_id,
      student_user_id: user.id,
      course_name: quiz.course_name,
      recipient_name: profile.full_name.trim().slice(0, 120),
      certificate_code: code,
      score,
    }, { onConflict: 'quiz_id,student_user_id', ignoreDuplicates: true }).select('id,course_name,recipient_name,certificate_code,score,issued_at').maybeSingle();
    if (certificateError) return NextResponse.json({ error: `You passed, but the theory certificate could not be issued: ${certificateError.message}` }, { status: 500 });
    certificate = issued;
    if (!certificate) {
      const { data: existing, error: existingError } = await admin.from('theory_certificates')
        .select('id,course_name,recipient_name,certificate_code,score,issued_at').eq('quiz_id', quizId).eq('student_user_id', user.id).maybeSingle();
      if (existingError) return NextResponse.json({ error: `You passed, but the existing certificate could not be loaded: ${existingError.message}` }, { status: 500 });
      certificate = existing;
    }
  }
  return NextResponse.json({
    attempt,
    correctCount,
    totalQuestions: questions.length,
    feedback,
    certificate,
    passed,
    message: passed
      ? 'Theory knowledge check passed. A separate Theory Learning Certificate has been issued.'
      : 'Not passed yet. Review the explanations and try again. A score of 80% is required.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
