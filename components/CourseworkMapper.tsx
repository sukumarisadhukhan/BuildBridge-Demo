'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, FolderKanban, Sparkles, Trash2, UploadCloud } from 'lucide-react';

type CourseworkMap = {
  id: string;
  source_file_name: string;
  course_name: string;
  career_goal: string;
  summary: string;
  concepts: { name: string; explanation: string; priority: string; careerRelevance: string; linkedSkills: string[] }[];
  mapped_skills: { skill: string; whyItMatters: string; nextAction: string }[];
  project_suggestions: { title: string; description: string; evidenceIdea: string; skills: string[] }[];
  created_at: string;
  quiz: {
    id: string;
    questions: { question: string; concept: string; options: string[] }[];
    attempts: { id: string; score: number; passed: boolean; feedback: any[]; attempted_at: string }[];
    certificate: { id: string; course_name: string; recipient_name: string; certificate_code: string; score: number; issued_at: string } | null;
  } | null;
};


function TheoryKnowledgeCheck({ quiz, onRefresh }: { quiz: NonNullable<CourseworkMap['quiz']>; onRefresh: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const latestAttempt = quiz.attempts?.[0];
  const certificate = quiz.certificate;
  const feedback = result?.feedback || latestAttempt?.feedback || [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.keys(answers).length !== quiz.questions.length) {
      setError(`Answer all ${quiz.questions.length} questions before submitting.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const orderedAnswers = quiz.questions.map((_, index) => answers[index]);
      const response = await fetch('/api/coursework/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, answers: orderedAnswers }),
      });
      const data = await response.json().catch(() => ({ error: 'Knowledge check returned an unreadable response.' }));
      if (!response.ok) throw new Error(data.error || `Knowledge check failed (${response.status}).`);
      setResult(data);
      setAnswers({});
      onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Knowledge check could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="theory-knowledge-check">
    <div className="theory-check-heading"><div><span className="journey-kicker">THEORY COMPLETION</span><h4>Knowledge check</h4><p>Answer the questions from the uploaded material. A score of 80% or higher earns a separate theory certificate.</p></div>{latestAttempt&&<span className={`theory-last-score ${latestAttempt.passed?'passed':''}`}>Last score: {Number(latestAttempt.score).toFixed(0)}%</span>}</div>
    {certificate?<div className="theory-certificate-card"><div className="theory-certificate-emblem"><BookOpen size={25}/></div><div><span>AWARDED</span><h4>Theory Learning Certificate</h4><p>{certificate.course_name} · Score {Number(certificate.score).toFixed(0)}%</p><small>Certificate ID: {certificate.certificate_code} · {new Date(certificate.issued_at).toLocaleDateString()}</small></div><button className="primary" onClick={()=>window.print()}>Print / Save as PDF</button><div className="theory-certificate-print"><span>BUILD BRIDGE · LEARNING RECORD</span><div className="print-rule"/><h1>THEORY LEARNING CERTIFICATE</h1><p className="print-presented">This certificate confirms that</p><h2>{certificate.recipient_name}</h2><p>has successfully completed the theory knowledge check for</p><h3>{certificate.course_name}</h3><p>with a verified score of <b>{Number(certificate.score).toFixed(0)}%</b>.</p><div className="print-rule"/><small>Certificate ID: {certificate.certificate_code} · Issued {new Date(certificate.issued_at).toLocaleDateString()}</small><footer>BUILD BRIDGE<br/>Theory Knowledge Completion</footer></div></div>:<form className="theory-quiz-form" onSubmit={submit}>
      {quiz.questions.map((question,index)=><fieldset className="theory-question" key={`${quiz.id}-${index}`}><legend><span>{index+1}</span>{question.question}</legend>{question.concept&&<small>Concept: {question.concept}</small>}<div className="theory-options">{question.options.map((option,optionIndex)=><label key={`${index}-${optionIndex}`} className={answers[index]===optionIndex?'selected':''}><input type="radio" name={`theory-${quiz.id}-${index}`} value={optionIndex} checked={answers[index]===optionIndex} onChange={()=>setAnswers(current=>({...current,[index]:optionIndex}))}/><span>{String.fromCharCode(65+optionIndex)}.</span>{option}</label>)}</div></fieldset>)}
      {error&&<p className="auth-message error" role="alert">{error}</p>}
      {result&&<div className={`theory-quiz-result ${result.passed?'passed':'not-passed'}`} role="status"><b>{result.passed?'Theory knowledge check passed':'Keep learning and try again'}</b><span>{result.correctCount} of {result.totalQuestions} correct · {Number(result.attempt?.score??result.score).toFixed(0)}%</span><p>{result.message}</p></div>}
      {feedback.length>0&&<div className="theory-feedback">{feedback.map((item:any,index:number)=><article key={`${quiz.id}-feedback-${index}`} className={item.correct?'correct':'incorrect'}><b>{item.correct?'Correct':'Review'}: {item.concept||`Question ${index+1}`}</b><p>{item.explanation}</p>{!item.correct&&<small>Correct answer: {item.correctOption}</small>}</article>)}</div>}
      <button className="primary" type="submit" disabled={busy}>{busy?'Checking answers…':(latestAttempt||result?'Retake knowledge check':'Submit knowledge check')}</button>
    </form>}
  </section>;
}

export function CourseworkMapper({ careerGoal, onExploreProjects }: { careerGoal: string; onExploreProjects: () => void }) {
  const [maps, setMaps] = useState<CourseworkMap[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selected = useMemo(() => maps.find(map => map.id === selectedId) || maps[0] || null, [maps, selectedId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/coursework', { cache: 'no-store' });
      const result = await response.json().catch(() => ({ error: 'Coursework history returned an unreadable response.' }));
      if (!response.ok) throw new Error(result.error || 'Coursework history could not be loaded.');
      const records = Array.isArray(result.maps) ? result.maps as CourseworkMap[] : [];
      setMaps(records);
      setSelectedId(current => records.some(record => record.id === current) ? current : records[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Coursework history could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError('Choose a syllabus or assignment file first.'); return; }
    const data = new FormData();
    data.set('file', file);
    data.set('careerGoal', careerGoal);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/coursework', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({ error: 'Coursework analysis returned an unreadable response.' }));
      if (!response.ok) throw new Error(result.error || `Coursework analysis failed (${response.status}).`);
      if (!result.map?.id) throw new Error('The analysis completed but no saved coursework record was returned.');
      setMaps(current => [result.map, ...current.filter(item => item.id !== result.map.id)]);
      setSelectedId(result.map.id);
      setFile(null);
      setMessage(result.quizWarning ? `Coursework mapped. ${result.quizWarning}` : 'Coursework mapped. The original file was not retained; only the structured analysis is saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Coursework could not be analyzed.');
    } finally {
      setBusy(false);
    }
  }

  async function removeRecord(id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/coursework', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const result = await response.json().catch(() => ({ error: 'The delete request returned an unreadable response.' }));
      if (!response.ok) throw new Error(result.error || 'Coursework record could not be deleted.');
      const remaining = maps.filter(item => item.id !== id);
      setMaps(remaining);
      setSelectedId(remaining[0]?.id || '');
      setMessage('Coursework analysis removed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Coursework analysis could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel coursework-mapper">
    <div className="section-title"><div><span className="journey-kicker"><BookOpen size={14}/> COURSEWORK-FIRST PATH</span><h2>Map what you already study</h2></div><span className="coursework-goal">Career goal: {careerGoal}</span></div>
    <p className="muted">Upload a syllabus or assignment to extract concrete concepts, connect them to useful skills and suggest small evidence-producing projects. A syllabus is a starting point, not proof that a skill is mastered.</p>
    <form className="coursework-upload" onSubmit={analyze}>
      <label className="coursework-file"><UploadCloud size={21}/><span><b>{file?.name || 'Choose a syllabus or assignment'}</b><small>PDF or plain text · Maximum 4 MB · Password-protected PDFs are not supported</small></span><input type="file" accept="application/pdf,.pdf,text/plain,.txt,.md,.csv" onChange={event=>setFile(event.target.files?.[0]||null)}/></label>
      <button className="primary" type="submit" disabled={busy||!file}><Sparkles size={15}/>{busy?'Analyzing coursework…':'Analyze and map'}</button>
    </form>
    <p className="coursework-privacy">Your file is sent to the configured Gemini service for analysis. BuildBridge saves the structured concepts and recommendations, not the original file. Do not upload confidential or restricted material.</p>
    {error&&<p className="auth-message error" role="alert">{error}<button className="text-btn" onClick={()=>void load()}>Retry</button></p>}
    {message&&<p className="auth-message" role="status">{message}</p>}
    {loading?<p className="muted">Loading saved coursework maps…</p>:maps.length>0?<div className="coursework-results">
      <aside className="coursework-history"><b>Saved coursework</b>{maps.map(map=><button type="button" key={map.id} className={selected?.id===map.id?'active':''} onClick={()=>setSelectedId(map.id)}><FileText size={15}/><span><b>{map.course_name}</b><small>{new Date(map.created_at).toLocaleDateString()}</small></span></button>)}</aside>
      {selected&&<div className="coursework-detail">
        <div className="coursework-detail-head"><div><span className="journey-kicker">COURSEWORK MAP</span><h3>{selected.course_name}</h3><small>{selected.source_file_name} · Mapped for {selected.career_goal}</small></div><button className="icon-btn" aria-label="Delete this coursework map" disabled={busy} onClick={()=>void removeRecord(selected.id)}><Trash2 size={16}/></button></div>
        {selected.summary&&<p className="coursework-summary">{selected.summary}</p>}
        <div className="coursework-columns">
          <section><h4>Concepts identified <span>{selected.concepts?.length||0}</span></h4>{selected.concepts?.map((concept,index)=><article className="coursework-concept" key={`${concept.name}-${index}`}><div><b>{concept.name}</b><small className={`coursework-priority ${concept.priority||'medium'}`}>{concept.priority||'medium'} priority</small></div><p>{concept.explanation}</p>{concept.careerRelevance&&<small>{concept.careerRelevance}</small>}{concept.linkedSkills?.length>0&&<div className="tag-row">{concept.linkedSkills.map(skill=><span className="skill-chip" key={skill}>{skill}</span>)}</div>}</article>)}</section>
          <section><h4>Mapped skills <span>{selected.mapped_skills?.length||0}</span></h4>{selected.mapped_skills?.map((skill,index)=><article className="coursework-skill" key={`${skill.skill}-${index}`}><b>{skill.skill}</b><p>{skill.whyItMatters}</p><small>Next action: {skill.nextAction}</small></article>)}</section>
        </div>
        {selected.quiz?<TheoryKnowledgeCheck quiz={selected.quiz} onRefresh={()=>void load()}/>:<div className="theory-check-unavailable"><BookOpen size={17}/><span>No knowledge check is available for this map. Re-upload a fuller source document to generate a reliable assessment.</span></div>}
        {selected.project_suggestions?.length>0&&<section className="coursework-projects"><div className="section-title"><h4><FolderKanban size={17}/> Suggested project directions</h4><button className="outline" onClick={onExploreProjects}>Browse BuildBridge projects</button></div>{selected.project_suggestions.map((project,index)=><article className="coursework-project" key={`${project.title}-${index}`}><b>{project.title}</b><p>{project.description}</p>{project.skills?.length>0&&<small>Skills: {project.skills.join(', ')}</small>}{project.evidenceIdea&&<small>Evidence idea: {project.evidenceIdea}</small>}</article>)}</section>}
      </div>}
    </div>:<div className="coursework-empty"><BookOpen size={28}/><b>No coursework maps yet</b><span>Upload a course document to connect your current subjects to your career target.</span></div>}
  </section>;
}
