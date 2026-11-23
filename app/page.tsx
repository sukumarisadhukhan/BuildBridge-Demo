import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, CheckCircle2, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';
import { BuildJourneyPreview } from '@/components/BuildJourneyPreview';

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link href="/" className="landing-brand" aria-label="BuildBridge home">
          <Image src="/buildbridge-logo.png" alt="BuildBridge" width={178} height={58} priority />
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#for-organizations">For organizations</a>
          <Link className="landing-signin" href="/auth/sign-in">Sign in</Link>
          <Link className="primary" href="/auth/sign-up">Get started <ArrowRight size={16}/></Link>
        </nav>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-kicker"><Sparkles size={15}/> LEARN WITH A PURPOSE</span>
          <h1>Everything you need to learn, build and become <em>work-ready.</em> In one place.</h1>
          <p>Discover the right learning resources, build practical skills through real projects, document your achievements and connect with relevant professional opportunities.</p>
          <div className="landing-actions">
            <Link className="primary" href="/auth/sign-up">Start your journey <ArrowRight size={16}/></Link>
            <a className="landing-secondary" href="#how-it-works">Explore the platform</a>
          </div>
          <div className="landing-proof"><span><CheckCircle2 size={16}/> Work at your pace</span><span><ShieldCheck size={16}/> Clear, verifiable records</span></div>
        </div>
        <div className="landing-art" aria-hidden="true">
          <div className="landing-orbit orbit-one"/><div className="landing-orbit orbit-two"/>
          <div className="landing-art-card"><div className="landing-art-icon"><GraduationCap size={27}/></div><b>Learn. Build. Prove.</b><span>Your career, in motion.</span><div className="landing-progress"><i/></div><small>One meaningful step at a time</small></div>
          <div className="landing-float landing-float-one"><BookOpen size={17}/> Skill plan</div>
          <div className="landing-float landing-float-two"><CheckCircle2 size={17}/> Project evidence</div>
        </div>
      </section>
      <BuildJourneyPreview/>
      <section className="landing-callout" id="for-organizations"><div><span>FOR STUDENTS AND ORGANIZATIONS</span><h2>Build skills around real goals.</h2><p>Students can shape a learning journey. Organizations can participate through verified company workflows.</p></div><Link className="outline" href="/auth/sign-up">Create an account <ArrowRight size={15}/></Link></section>
      <footer className="landing-footer"><Link href="/" className="landing-brand"><Image src="/buildbridge-logo.png" alt="BuildBridge" width={145} height={45}/></Link><span>Bridging traditional learning to real-world work.</span><Link href="/auth/sign-in">Sign in</Link></footer>
    </main>
  );
}
