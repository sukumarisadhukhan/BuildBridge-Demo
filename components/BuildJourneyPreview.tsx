'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Award, BookOpen, BriefcaseBusiness, CheckCircle2, Code2, Pause, Play, Sparkles } from 'lucide-react';
import { STUDENT_JOURNEY_STAGES } from '@/lib/build-journey';

const icons = [BookOpen, Code2, CheckCircle2, Award];
const colors = ['learn', 'build', 'prove', 'earn'];

export function BuildJourneyPreview() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActive(current => (current + 1) % STUDENT_JOURNEY_STAGES.length), 3900);
    return () => window.clearInterval(timer);
  }, [paused]);

  const current = STUDENT_JOURNEY_STAGES[active];
  const ActiveIcon = icons[active];

  return <section className="build-journey-preview" aria-label="Interactive BuildBridge journey" id="how-it-works">
    <div className="build-journey-heading">
      <div><span className="journey-kicker"><Sparkles size={14}/> THE BUILD BRIDGE METHOD</span><h2>Four stages. One connected journey.</h2><p>Watch how a learning goal becomes evidence of work and a better-matched opportunity.</p></div>
      <button className="journey-pause" onClick={()=>setPaused(value=>!value)} aria-pressed={paused}>{paused?<Play size={15}/>:<Pause size={15}/>} {paused?'Play journey':'Pause journey'}</button>
    </div>
    <div className="build-journey-track" role="tablist" aria-label="Journey stages">
      {STUDENT_JOURNEY_STAGES.map((stage,index)=>{
        const Icon=icons[index];
        return <button key={stage.id} role="tab" aria-selected={active===index} aria-controls="build-journey-detail" className={`build-journey-stage ${colors[index]} ${active===index?'active':''} ${index<active?'complete':''}`} onClick={()=>setActive(index)}>
          <span className="build-journey-icon"><Icon size={20}/></span><span className="build-journey-stage-text"><b>{stage.name}</b><small>{stage.detail}</small></span><span className="build-journey-number">0{index+1}</span>
        </button>;
      })}
    </div>
    <div className={`build-journey-detail ${colors[active]}`} id="build-journey-detail" role="tabpanel" aria-live="polite">
      <div className="build-journey-detail-art"><div className="build-journey-glow"/><div className="build-journey-orbit orbit-a"/><div className="build-journey-orbit orbit-b"/><span className="build-journey-large-icon"><ActiveIcon size={42}/></span><small>STAGE 0{active+1} / 04</small></div>
      <div className="build-journey-detail-copy"><span className="build-journey-overline">{current.name.toUpperCase()} · YOUR PROGRESS, CONNECTED</span><h3>{current.title}</h3><p>{current.description}</p><div className="build-journey-progress" aria-label={`${active+1} of 4 journey stages`}><span style={{width:`${((active+1)/4)*100}%`}}/></div><div className="build-journey-bottom"><span>{current.action}</span><Link href="/auth/sign-up">Start your journey <ArrowRight size={15}/></Link></div></div>
    </div>
    <div className="build-journey-footnote"><span><BriefcaseBusiness size={15}/> Organizations participate through domain and company verification.</span><span>Credentials depend on completed evidence and the applicable approval process.</span></div>
  </section>;
}
