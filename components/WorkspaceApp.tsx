'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearRememberPreference, createClient } from '@/lib/supabase';
import { ProjectManagement } from '@/components/ProjectManagement';
import { StudentMyProjects, StudentProjectCatalogue } from '@/components/ProjectMarketplace';
import { CertificateAdministration, CertificateVault, CompanyCertificateAuthorization } from '@/components/CertificateManagement';
import { AdminCompanyDomainRequests, CompanyDomainRequest } from '@/components/CompanyDomainWorkflow';
import { AdminNotificationSettings, CompanyNotificationSettings, ExtendedProfileFields, NotificationSettings } from '@/components/AccountPreferences';
import { NotificationCenter } from '@/components/NotificationCenter';
import { CourseworkMapper } from '@/components/CourseworkMapper';
import { OpportunityManagement } from '@/components/OpportunityManagement';
import { YouTubeWatchPlayer } from '@/components/YouTubeWatchPlayer';
import { normalizeYouTubeVideoId } from '@/components/YouTubeWatchPlayer';
import { StudentVault } from '@/components/StudentVault';
import { SafeMarkdown } from '@/components/SafeMarkdown';
import { STUDENT_JOURNEY_STAGES } from '@/lib/build-journey';

import { Home, Compass, BookOpen, FolderKanban, BriefcaseBusiness, Award, Bot, Settings, Search, ChevronRight, GraduationCap, Code2, Sparkles, Upload, CheckCircle2, Menu, X, Moon, Sun, Building2, ShieldCheck, LogOut, FileText, ExternalLink, CircleHelp, Plus, Eye, LockKeyhole, UserRound, Camera, Mail, Phone, KeyRound, Bookmark, BookmarkCheck, PlayCircle } from 'lucide-react';

type Role='student'|'company_member'|'admin';
type Screen='Dashboard'|'My Path'|'Learn'|'Projects'|'My Projects'|'My Learning & Work Vault'|'Opportunities'|'Achievements'|'AI Mentor'|'Profile'|'Settings'|'Platform Health'|'Create Project'|'Submissions'|'Company Profile'|'Company Verification'|'Project Moderation'|'Certificates'|'AI Management'|'Users & Access'|'Disputes'|'Audit Trail';
const studentNav: {name:Screen;icon:any}[]=[{name:'Dashboard',icon:Home},{name:'My Path',icon:Compass},{name:'Learn',icon:BookOpen},{name:'Projects',icon:FolderKanban},{name:'My Projects',icon:CheckCircle2},{name:'My Learning & Work Vault',icon:FolderKanban},{name:'Opportunities',icon:BriefcaseBusiness},{name:'Achievements',icon:Award},{name:'AI Mentor',icon:Bot},{name:'Settings',icon:Settings}];
const companyNav: {name:Screen;icon:any}[]=[{name:'Dashboard',icon:Home},{name:'Create Project',icon:Plus},{name:'Submissions',icon:FolderKanban},{name:'Opportunities',icon:BriefcaseBusiness},{name:'Company Profile',icon:Building2},{name:'Settings',icon:Settings}];
const adminNav: {name:Screen;icon:any}[]=[{name:'Dashboard',icon:Home},{name:'Company Verification',icon:ShieldCheck},{name:'Project Moderation',icon:FolderKanban},{name:'Certificates',icon:Award},{name:'AI Management',icon:Bot},{name:'Users & Access',icon:BriefcaseBusiness},{name:'Disputes',icon:CircleHelp},{name:'Audit Trail',icon:FileText},{name:'Platform Health',icon:ShieldCheck},{name:'Settings',icon:Settings}];
const careerPlans:Record<string,{focus:string[];roadmap:string[]}>={
 'Data Analyst':{focus:['SQL','Data Analysis','EDA','Python','Pandas'],roadmap:['SQL for analytics','Python and Pandas foundations','Statistics and exploratory analysis','Data visualization and storytelling','Portfolio dashboards and evidence review','Industry opportunities and interviews']},
 'AI / ML Engineer':{focus:['Python','Pandas','EDA','Statistics','Data Analysis'],roadmap:['Python programming and data handling','Statistics, probability and linear algebra','Exploratory analysis and feature engineering','Machine learning fundamentals','Model evaluation and deployment projects','Production AI systems and interviews']},
 'Full-stack Developer':{focus:['JavaScript','React','APIs','SQL','Python'],roadmap:['Programming foundations and Git','Web fundamentals and user interfaces','APIs and database-backed applications','Authentication, testing and deployment','End-to-end portfolio projects','Production engineering and interviews']},
 'Frontend Developer':{focus:['HTML','CSS','JavaScript','React','Accessibility'],roadmap:['Semantic HTML and responsive CSS','JavaScript and browser fundamentals','Reusable React components and state','Accessibility and frontend testing','Build and deploy a portfolio application','Performance, collaboration and interviews']},
 'Backend Developer':{focus:['APIs','Node.js','SQL','Authentication','Testing'],roadmap:['Programming and command-line fundamentals','HTTP APIs and server architecture','SQL data modeling and queries','Authentication, authorization and validation','Automated tests and deployment','Observability, reliability and interviews']},
 'Data Scientist':{focus:['Python','Statistics','Pandas','Machine Learning','Data Visualization'],roadmap:['Python and data-wrangling foundations','Statistics and experimental thinking','Exploratory analysis and visualization','Machine-learning models and evaluation','Reproducible portfolio projects','Model delivery and interview practice']},
 'Product Manager':{focus:['Product Analytics','Data Analytics','Statistics','SQL','Communication'],roadmap:['Customer discovery and problem framing','Product metrics and analytics','Prioritization and roadmap design','Experimentation and outcome measurement','Product case studies and portfolio','Stakeholder communication and interviews']},
 'Cybersecurity Analyst':{focus:['Cybersecurity','Networking','Linux','Python','SQL'],roadmap:['Networking and operating-system fundamentals','Security principles and threat modeling','Log analysis and query skills','Scripting and incident response','Hands-on security projects and evidence','Security operations and interviews']},
 'UI/UX Designer':{focus:['User Research','Figma','Prototyping','Accessibility','Usability Testing'],roadmap:['User research and problem framing','Information architecture and user flows','Figma foundations and visual systems','Prototyping and usability testing','Accessible portfolio case studies','Design collaboration and interviews']},
 'Cloud Engineer':{focus:['Linux','Networking','Cloud Fundamentals','Containers','Infrastructure as Code'],roadmap:['Linux and networking foundations','Cloud concepts and identity security','Containers and deployment workflows','Infrastructure as code and automation','Monitoring, reliability and cost controls','Cloud projects and interview practice']},
};
function Brand({small=false}:{small?:boolean}) {return <div className={'brand '+(small?'brand-compact':'')}><img src="/buildbridge-logo.png" alt="BuildBridge — Bridging traditional learning to real-world work"/></div>}
function Pill({children,tone='green'}:{children:React.ReactNode;tone?:string}){return <span className={'pill '+tone}>{children}</span>}
function ProfileAvatar({src,name,className='avatar'}:{src:string;name:string;className?:string}){return <div className={className}>{src?<img src={src} alt=""/>:<span>{(name||'U').slice(0,1).toUpperCase()}</span>}</div>}
function clampFloatingPosition(x:number,y:number,width:number,height:number){return {x:Math.max(8,Math.min(x,window.innerWidth-width-8)),y:Math.max(8,Math.min(y,window.innerHeight-height-8))};}
function floatingPanelAlign(x:number,buttonWidth:number,viewportWidth:number){return x+buttonWidth+Math.min(390,viewportWidth-32)>viewportWidth-8?'right':'left';}
type InitialProfile={id:string;email:string;full_name:string|null;role:Role;career_goal:string|null;phone_number?:string|null;avatar_path?:string|null;education_level?:string|null;academic_year?:string|null;location?:string|null;cgpa?:number|null};
export default function WorkspaceApp({initialProfile,companyPortal=false}:{initialProfile:InitialProfile;companyPortal?:boolean}){
 const [role,setRole]=useState<Role>(initialProfile.role);
 const [screen,setScreenState]=useState<Screen>('Dashboard');
 const [dark,setDark]=useState(false);
 const [mobile,setMobile]=useState(false);
 const [signed,setSigned]=useState(true);
 const [authChecking,setAuthChecking]=useState(false);
 const [email,setEmail]=useState(initialProfile.email||'');
 const [newEmail,setNewEmail]=useState('');
 const [password,setPassword]=useState('');
 const [name,setName]=useState(initialProfile.full_name||'');
 const [phoneNumber,setPhoneNumber]=useState(initialProfile.phone_number||'');
 const [avatarPath,setAvatarPath]=useState(initialProfile.avatar_path||'');
 const [avatarUrl,setAvatarUrl]=useState('');
 const [avatarFile,setAvatarFile]=useState<File|null>(null);
 const [avatarPreview,setAvatarPreview]=useState('');
 const [newPassword,setNewPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [goal,setGoal]=useState(initialProfile.career_goal||'Data Analyst');
 const [goalDraft,setGoalDraft]=useState(initialProfile.career_goal||'Data Analyst');
 const [tour,setTour]=useState(true);
 const [tourStep,setTourStep]=useState(0);
 const [tourPaused,setTourPaused]=useState(false);
 const [showSignup,setShowSignup]=useState(false);
 const [notice,setNotice]=useState('');
 const [query,setQuery]=useState('');
 const [searchQuery,setSearchQuery]=useState('');
 const [resourceFilter,setResourceFilter]=useState('All');
 const [durationFilter,setDurationFilter]=useState('Any duration');
 const [creatorFilter,setCreatorFilter]=useState('Any creator');
 const [selectedLearningVideo,setSelectedLearningVideo]=useState<any>(null);
 const [learningPlaybackPosition,setLearningPlaybackPosition]=useState(0);
 const [learningCompletionModal,setLearningCompletionModal]=useState(false);
 const [resourceRefresh,setResourceRefresh]=useState(0);
 const [recommendedResources,setRecommendedResources]=useState<any[]>([]);
 const [savedResources,setSavedResources]=useState<any[]>([]);
 const [resourceLoading,setResourceLoading]=useState(false);
 const [resourceError,setResourceError]=useState('');
 const [opportunityCategory,setOpportunityCategory]=useState('Internships');
 const [opportunityKeyword,setOpportunityKeyword]=useState('');
 const [aiResponse,setAiResponse]=useState('');
 const [aiConversationId,setAiConversationId]=useState('');
 const [aiMessages,setAiMessages]=useState<any[]>([]);
 const [aiMentorError,setAiMentorError]=useState('');
 const [lastAiPrompt,setLastAiPrompt]=useState('');
 const aiRequestInFlightRef=useRef(false);
 const sessionActivationRef=useRef(false);
 const activatedUserIdRef=useRef('');
 const [mentorOpen,setMentorOpen]=useState(false);
 const [mentorPosition,setMentorPosition]=useState<{x:number;y:number}|null>(null);
 const [mentorDragging,setMentorDragging]=useState(false);
 const [mentorPlacement,setMentorPlacement]=useState<'above'|'below'>('above');
 const [mentorAlign,setMentorAlign]=useState<'left'|'right'>('left');
 const [mentorViewport,setMentorViewport]=useState<{width:number;height:number}|null>(null);
 const mentorDragRef=useRef<{pointerId:number;offsetX:number;offsetY:number;startX:number;startY:number;moved:boolean}|null>(null);
 const mentorLastDragRef=useRef(0);
 const mentorLauncherRef=useRef<HTMLButtonElement|null>(null);
 const mentorPanelRef=useRef<HTMLElement|null>(null);
 const workspaceContentRef=useRef<HTMLDivElement|null>(null);
 const [roadmapPlan,setRoadmapPlan]=useState<any>(null);
 const [roadmapLoading,setRoadmapLoading]=useState(false);
 const [roadmapError,setRoadmapError]=useState('');
 const [modal,setModal]=useState('');
 const [companyName,setCompanyName]=useState('');
 const [backendHealth,setBackendHealth]=useState<any>(null);
 const [announcementSubject,setAnnouncementSubject]=useState('');
 const [announcementBody,setAnnouncementBody]=useState('');
 const [busy,setBusy]=useState(false);
 const [workspaceData,setWorkspaceData]=useState<any>(null);
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const [workspaceError,setWorkspaceError]=useState('');
 const [selectedSubmission,setSelectedSubmission]=useState<any>(null);
 const [reviewFeedback,setReviewFeedback]=useState('');
 const [reviewEvidenceError,setReviewEvidenceError]=useState('');
 const [selectedProjectId,setSelectedProjectId]=useState('');
 const learningPlayerRef=useRef<HTMLDivElement|null>(null);
 const lastOpenedVideoRef=useRef('');
 const playbackSaveTimeRef=useRef(0);
 const [applications,setApplications]=useState<string[]>([]);
 const nav=role==='student'?studentNav:role==='company_member'?companyNav:adminNav;
 const supabase=useMemo(()=>createClient(),[]);
 const router=useRouter();
 useEffect(()=>{
  if(role!=='student')return;
  try{
   const saved=window.localStorage.getItem(`buildbridge-playback:${initialProfile.id}`);
   if(!saved)return;
   const parsed=JSON.parse(saved);
   const videoId=normalizeYouTubeVideoId(parsed.videoId);
   if(!videoId)return;
   setSelectedLearningVideo({
    videoId,
    video_id:videoId,
    title:String(parsed.title||'YouTube learning resource').slice(0,300),
    channel:String(parsed.channel||'YouTube creator').slice(0,200),
    thumbnail:String(parsed.thumbnail||''),
    topic:String(parsed.topic||goal).slice(0,100),
   });
   setLearningPlaybackPosition(parsed.completed?0:Number(parsed.positionSeconds||0));
  }catch{}
  void (async()=>{
   try{
    if(!supabase)return;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.access_token)return;
    const response=await fetch('/api/resources/playback',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
    if(!response.ok)return;
    const result=await response.json();
    const playback=result.data;
    if(!playback?.video_id)return;
    const videoId=normalizeYouTubeVideoId(playback.video_id);
    if(!videoId)return;
    setSelectedLearningVideo({
     videoId,
     video_id:videoId,
     title:String(playback.title||'YouTube learning resource').slice(0,300),
     channel:String(playback.channel||'YouTube creator').slice(0,200),
     thumbnail:String(playback.thumbnail||''),
     topic:String(playback.topic||goal).slice(0,100),
    });
    setLearningPlaybackPosition(playback.completed?0:Number(playback.position_seconds||0));
   }catch{}
  })();
 },[initialProfile.id,role,goal,supabase]);

 function setScreen(nextScreen:Screen){
  setScreenState(nextScreen);
  if(typeof window!=='undefined'){
   try{
    window.sessionStorage.setItem('buildbridge-screen',nextScreen);
    const url=new URL(window.location.href);
    if(nextScreen==='Dashboard')url.searchParams.delete('screen');
    else url.searchParams.set('screen',nextScreen);
    window.history.replaceState(window.history.state,'',url.toString());
   }catch{}
  }
  if(!signed)return;
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
   workspaceContentRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
 }

 function navigateToScreen(nextScreen:Screen,closeMobile=false){
  setScreen(nextScreen);
  if(closeMobile)setMobile(false);
 }

 async function activateSession(session:any){
  if(!supabase||!session?.user?.id) return;
  const {error:ensureError}=await supabase.rpc('ensure_my_profile');
  if(ensureError) throw new Error(`Your account signed in, but its BuildBridge profile could not be prepared. In Supabase SQL Editor, run supabase/auth-setup-repair.sql. Details: ${ensureError.message}`);
  const {data:profile,error}=await supabase.from('profiles').select('id,email,full_name,role,career_goal,phone_number,avatar_path').eq('id',session.user.id).maybeSingle();
  if(error) throw new Error(`Could not load your BuildBridge profile: ${error.message}`);
  if(!profile) throw new Error('Your Supabase account exists, but its BuildBridge profile is missing. Run supabase/auth-setup-repair.sql.');
  if(!['student','company_member','admin'].includes(profile.role)) throw new Error('Your account has an unsupported BuildBridge role. Contact the platform administrator.');
  setRole(profile.role as Role);
  setEmail(session.user.email||profile.email||'');
  setNewEmail(session.user.email||profile.email||'');
  setName(profile.full_name||session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'');
  setPhoneNumber(profile.phone_number||'');
  setAvatarPath(profile.avatar_path||'');
  setGoal(profile.career_goal||'Data Analyst');
  setGoalDraft(profile.career_goal||'Data Analyst');
  setSigned(true);
  activatedUserIdRef.current=session.user.id;
  sessionActivationRef.current=false;
  const requestedScreen=new URLSearchParams(window.location.search).get('screen');
  let savedScreen='';
  try{savedScreen=window.sessionStorage.getItem('buildbridge-screen')||'';}catch{}
  const candidate=requestedScreen||savedScreen||screen;
  const allowedScreens=profile.role==='student'
   ? [...studentNav.map(item=>item.name),'Profile']
   : profile.role==='company_member'
    ? [...companyNav.map(item=>item.name),'Profile']
    : [...adminNav.map(item=>item.name),'Profile'];
  const restoredScreen=allowedScreens.includes(candidate as Screen)?candidate as Screen:'Dashboard';
  setScreenState(restoredScreen);
  try{window.sessionStorage.setItem('buildbridge-screen',restoredScreen);}catch{}
 }

 useEffect(()=>{
  if(!supabase){setAuthChecking(false);setNotice('Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the app.');return;}
  let active=true;
  const handleSession=async(session:any)=>{
   if(!active)return;
   if(!session){setSigned(false);setAuthChecking(false);router.replace('/auth/sign-in');return;}
   if(activatedUserIdRef.current===session.user?.id) return;
   sessionActivationRef.current=true;
   try{await activateSession(session);}catch(error:any){if(active){setSigned(false);setNotice(error?.message||'Could not load your account.');}}
   finally{if(active)setAuthChecking(false);}
  };
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT'){activatedUserIdRef.current='';sessionActivationRef.current=false;setSigned(false);setWorkspaceData(null);setRole('student');setScreen('Dashboard');setAuthChecking(false);router.replace('/auth/sign-in');return;}
   if(session && (event==='INITIAL_SESSION'||event==='SIGNED_IN'||event==='USER_UPDATED')) window.setTimeout(()=>{void handleSession(session);},0);
  });
  supabase.auth.getSession().then(({data,error})=>{
   if(error) throw error;
   return handleSession(data.session);
  }).catch((error:any)=>{if(active){setNotice(error?.message||'Could not restore your session. Please sign in again.');setAuthChecking(false);}});
  return()=>{active=false;subscription.unsubscribe();};
 },[supabase,router]);

 useEffect(()=>{if(!tour||tourPaused)return;const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;if(reduceMotion)return;const timer=window.setInterval(()=>setTourStep(step=>(step+1)%6),4000);return()=>window.clearInterval(timer);},[tour,tourPaused]);
 useEffect(()=>{
  if(!avatarFile){setAvatarPreview('');return;}
  const preview=URL.createObjectURL(avatarFile);
  setAvatarPreview(preview);
  return()=>URL.revokeObjectURL(preview);
 },[avatarFile]);
 useEffect(()=>{
  const syncLearningLink=()=>{
   const params=new URLSearchParams(window.location.search);
   if(params.get('screen')==='Learn')setScreen('Learn');
   const topic=params.get('topic');
   if(topic)setResourceFilter(topic);
  };
  syncLearningLink();
  window.addEventListener('popstate',syncLearningLink);
  return()=>window.removeEventListener('popstate',syncLearningLink);
 },[]);
 useEffect(()=>{
  const viewport={width:window.innerWidth,height:window.innerHeight};
  setMentorViewport(viewport);
  const saved=window.localStorage.getItem('buildbridge-mentor-position');
  if(saved){
   try{
    const parsed=JSON.parse(saved);
    if(Number.isFinite(parsed.x)&&Number.isFinite(parsed.y)){
     const bounds=mentorLauncherRef.current?.getBoundingClientRect();
     const position=clampFloatingPosition(parsed.x,parsed.y,bounds?.width||180,bounds?.height||48);
     setMentorPosition(position);
     setMentorAlign(floatingPanelAlign(position.x,bounds?.width||180,viewport.width));
     setMentorPlacement(position.y<viewport.height/2?'below':'above');
    }
   }catch{
    window.localStorage.removeItem('buildbridge-mentor-position');
   }
  }
 },[]);
 useEffect(()=>{
  if(mentorPosition)window.localStorage.setItem('buildbridge-mentor-position',JSON.stringify(mentorPosition));
 },[mentorPosition]);
 useEffect(()=>{
  const resize=()=>{
   const viewport={width:window.innerWidth,height:window.innerHeight};
   setMentorViewport(viewport);
   if(!mentorPosition)return;
   const bounds=mentorLauncherRef.current?.getBoundingClientRect();
   const position=clampFloatingPosition(mentorPosition.x,mentorPosition.y,bounds?.width||180,bounds?.height||48);
   setMentorPosition(position);
   setMentorAlign(floatingPanelAlign(position.x,bounds?.width||180,viewport.width));
   setMentorPlacement(position.y<viewport.height/2?'below':'above');
  };
  window.addEventListener('resize',resize);
  return()=>window.removeEventListener('resize',resize);
 },[mentorPosition]);

 async function refreshWorkspace(){
  if(!supabase)return;
  setWorkspaceLoading(true);setWorkspaceError('');
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Please sign in again.');
   const response=await fetch('/api/backend?action=workspace',{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
   const result=await response.json().catch(()=>({error:'The backend returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Workspace request failed (${response.status}).`);
   setWorkspaceData(result.data||{});
   setApplications((result.data?.applications||[]).map((item:any)=>item.opportunity_id));
   if(result.data?.profile?.full_name)setName(result.data.profile.full_name);
   setEmail(result.data?.profile?.email||'');
   setNewEmail(result.data?.profile?.email||'');
   setPhoneNumber(result.data?.profile?.phone_number||'');
   const nextAvatarPath=result.data?.profile?.avatar_path||'';
   setAvatarPath(nextAvatarPath);
   if(nextAvatarPath){
    const {data:avatar,error:avatarError}=await supabase.storage.from('profile-avatars').createSignedUrl(nextAvatarPath,3600);
    if(avatarError)throw new Error(`Could not load your profile photo: ${avatarError.message}`);
    setAvatarUrl(avatar.signedUrl);
   }else setAvatarUrl('');
   if(result.data?.profile?.career_goal)setGoal(result.data.profile.career_goal);
   if(result.data?.profile?.career_goal)setGoalDraft(result.data.profile.career_goal);
   if(result.data?.company?.name)setCompanyName(result.data.company.name);
  }catch(error:any){setWorkspaceError(error?.message||'Workspace data could not be loaded.');setWorkspaceData(null);}
  finally{setWorkspaceLoading(false);}
 }
 useEffect(()=>{if(!signed){setWorkspaceData(null);return;}void refreshWorkspace();},[signed,role]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
 },[role]);
 useEffect(()=>{
  if(!signed)return;
  const refreshWhenActive=()=>{if(document.visibilityState==='visible')void refreshWorkspace();};
  window.addEventListener('focus',refreshWhenActive);
  document.addEventListener('visibilitychange',refreshWhenActive);
  return()=>{window.removeEventListener('focus',refreshWhenActive);document.removeEventListener('visibilitychange',refreshWhenActive);};
 },[signed,role]);
 useEffect(()=>{
  if(!signed)return;
  const frame=window.requestAnimationFrame(()=>workspaceContentRef.current?.scrollIntoView({behavior:'auto',block:'start'}));
  return()=>window.cancelAnimationFrame(frame);
 },[signed]);
 const recommendationContext=(workspaceData?.skills||[])
  .filter((item:any)=>item.status==='demonstrated'||item.status==='company_verified')
  .map((item:any)=>String(item.skill||'').trim().toLowerCase())
  .filter(Boolean)
  .sort()
  .join(',');
 useEffect(()=>{
  if(!signed||role!=='student'||screen!=='Learn'||!supabase){
   setResourceLoading(false);
   return;
  }
  const controller=new AbortController();
  setResourceLoading(true);
  setResourceError('');
  const loadResources=async()=>{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const topics=careerPlans[goal]?.focus.slice(0,3)||[];
   const params=new URLSearchParams({goal,topics:topics.join(','),topic:resourceFilter==='All'?'':resourceFilter});
   const response=await fetch(`/api/resources?${params}`,{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'});
   const result=await response.json().catch(()=>({error:'The video recommendation service returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Could not load videos (${response.status}).`);
   setRecommendedResources(Array.isArray(result.resources)?result.resources:[]);
   setSavedResources(Array.isArray(result.bookmarks)?result.bookmarks:[]);
  };
  void loadResources().catch(error=>{
   if(error.name!=='AbortError'){
    setRecommendedResources([]);
    setResourceError(error instanceof Error?error.message:'Could not load video recommendations.');
   }
  }).finally(()=>{if(!controller.signal.aborted)setResourceLoading(false);});
  return()=>controller.abort();
 },[signed,role,screen,goal,resourceFilter,resourceRefresh,supabase]);
 useEffect(()=>{
  if(!signed||role!=='student'||!supabase){setRoadmapPlan(null);setRoadmapLoading(false);return;}
  const controller=new AbortController();
  setRoadmapLoading(true);
  setRoadmapError('');
  const loadRoadmap=async()=>{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const response=await fetch('/api/roadmap',{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'});
   const result=await response.json().catch(()=>({error:'The roadmap service returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Could not load your saved roadmap (${response.status}).`);
   setRoadmapPlan(result.roadmap||null);
  };
  void loadRoadmap().catch(error=>{if(error.name!=='AbortError'){setRoadmapPlan(null);setRoadmapError(error instanceof Error?error.message:'Could not load your roadmap.');}})
   .finally(()=>{if(!controller.signal.aborted)setRoadmapLoading(false);});
  return()=>controller.abort();
 },[signed,role,goal,supabase]);
 useEffect(()=>{
  if(!signed||role!=='student'||screen!=='AI Mentor'||!supabase)return;
  const controller=new AbortController();
  const loadConversation=async()=>{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const response=await fetch('/api/ai',{headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,cache:'no-store'});
   const result=await response.json().catch(()=>({error:'The AI Mentor returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Could not load mentor history (${response.status}).`);
   if(result.conversation){
    setAiConversationId(result.conversation.id);
    setAiMessages(Array.isArray(result.messages)?result.messages:[]);
   }else{setAiConversationId('');setAiMessages([]);}
  };
  void loadConversation().catch(error=>{if(error.name!=='AbortError')setNotice(error instanceof Error?error.message:'Could not load mentor history.');});
  return()=>controller.abort();
 },[signed,role,screen,supabase]);

 async function authenticatedPost(body:any){
  if(!supabase)throw new Error('Supabase is not configured.');
  const {data:{session},error}=await supabase.auth.getSession();
  if(error)throw error;
  if(!session?.access_token)throw new Error('Your session has expired. Sign in again.');
  const response=await fetch('/api/backend',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({error:'The backend returned an unreadable response.'}));
  if(!response.ok)throw new Error(result.error||`Request failed (${response.status}).`);
  return result;
 }
 async function saveLearningActivity(resource:any,activity:'opened'|'completed'){
  try{
   await authenticatedPost({action:'record_learning_activity',videoId:resource.videoId,title:resource.title,channel:resource.channel,thumbnail:resource.thumbnail,topic:resource.topic,activity});
   if(activity==='completed')setNotice(`${resource.title} marked as completed.`);
   setResourceRefresh(value=>value+1);
   await refreshWorkspace();
  }catch(error:any){
   setNotice(error?.message||'Video learning progress could not be saved.');
  }
 }
  function openLearningVideo(resource:any){
   const videoId=normalizeYouTubeVideoId(resource.videoId||resource.video_id||resource.url||resource.watchUrl);
   if(!videoId){
    setNotice('This resource does not contain a usable YouTube video ID.');
    return;
   }
   let restoredPosition=0;
   try{
    const saved=window.localStorage.getItem(`buildbridge-playback:${initialProfile.id}`);
    if(saved){
     const parsed=JSON.parse(saved);
     if(parsed.videoId===videoId && !parsed.completed)restoredPosition=Number(parsed.positionSeconds||0);
    }
   }catch{}
   setLearningPlaybackPosition(restoredPosition);
   setNotice('');
   setSelectedLearningVideo({...resource,videoId,title:String(resource.title||'YouTube learning resource').slice(0,300),video_id:videoId});
   if(lastOpenedVideoRef.current!==videoId){
    lastOpenedVideoRef.current=videoId;
    void saveLearningActivity({...resource,videoId,title:String(resource.title||'YouTube learning resource').slice(0,300)},'opened');
   }
   window.requestAnimationFrame(()=>{
    learningPlayerRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
   });
  }
  function closeLearningVideo(){
   try{window.localStorage.removeItem(`buildbridge-playback:${initialProfile.id}`);}catch{}
   setSelectedLearningVideo(null);
  }
  function handleLearningPlaybackPosition(positionSeconds:number,durationSeconds:number){
   setLearningPlaybackPosition(positionSeconds);
   if(!selectedLearningVideo)return;
   const videoId=normalizeYouTubeVideoId(selectedLearningVideo.videoId||selectedLearningVideo.video_id);
   if(!videoId)return;
   try{
    window.localStorage.setItem(`buildbridge-playback:${initialProfile.id}`,JSON.stringify({
     videoId,
     title:selectedLearningVideo.title,
     channel:selectedLearningVideo.channel||null,
     thumbnail:selectedLearningVideo.thumbnail||null,
     topic:selectedLearningVideo.topic||null,
     positionSeconds,
     durationSeconds,
     completed:false,
     updatedAt:new Date().toISOString(),
    }));
   }catch{}
   void (async()=>{
    try{
     if(!supabase)return;
     const {data:{session}}=await supabase.auth.getSession();
     if(!session?.access_token)return;
     await fetch('/api/resources/playback',{
      method:'PUT',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({
       videoId,
       title:selectedLearningVideo.title,
       channel:selectedLearningVideo.channel||null,
       thumbnail:selectedLearningVideo.thumbnail||null,
       topic:selectedLearningVideo.topic||null,
       positionSeconds:learningPlaybackPosition,
       durationSeconds:null,
       completed:true,
       activeFilters:{},
      }),
      cache:'no-store',
     });
    }catch{}
   })();
   const now=Date.now();
   if(now-playbackSaveTimeRef.current>=10000){
    playbackSaveTimeRef.current=now;
    void (async()=>{
     try{
      if(!supabase)return;
      const {data:{session}}=await supabase.auth.getSession();
      if(!session?.access_token)return;
      await fetch('/api/resources/playback',{
       method:'PUT',
       headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
       body:JSON.stringify({
        videoId,
        title:String(selectedLearningVideo.title||'YouTube learning resource').slice(0,300),
        channel:selectedLearningVideo.channel||null,
        thumbnail:selectedLearningVideo.thumbnail||null,
        topic:selectedLearningVideo.topic||null,
        positionSeconds,
        durationSeconds,
        completed:false,
        activeFilters:{},
       }),
       cache:'no-store',
      });
     }catch{}
    })();
   }
  }
 const handleLearningVideoStarted=useCallback(()=>{
  if(selectedLearningVideo){
   const videoId=normalizeYouTubeVideoId(selectedLearningVideo.videoId||selectedLearningVideo.video_id);
   if(videoId && lastOpenedVideoRef.current!==videoId){
    lastOpenedVideoRef.current=videoId;
    void saveLearningActivity({...selectedLearningVideo,videoId},'opened');
   }
  }
 },[selectedLearningVideo]);
 const handleLearningVideoCompleted=useCallback(()=>{
  if(selectedLearningVideo){
   const videoId=normalizeYouTubeVideoId(selectedLearningVideo.videoId||selectedLearningVideo.video_id);
   if(videoId){
    void saveLearningActivity({...selectedLearningVideo,videoId},'completed');
    setLearningCompletionModal(true);
    try{
     window.localStorage.setItem(`buildbridge-playback:${initialProfile.id}`,JSON.stringify({
      videoId,
      title:selectedLearningVideo.title,
      channel:selectedLearningVideo.channel||null,
      thumbnail:selectedLearningVideo.thumbnail||null,
      topic:selectedLearningVideo.topic||null,
      positionSeconds:learningPlaybackPosition,
      durationSeconds:null,
      completed:true,
      updatedAt:new Date().toISOString(),
     }));
    }catch{}
   }
  }
 },[selectedLearningVideo,learningPlaybackPosition,initialProfile.id]);
 async function toggleLearningBookmark(resource:any){
  try{
   await authenticatedPost({action:'set_learning_bookmark',videoId:resource.videoId,title:resource.title,channel:resource.channel,thumbnail:resource.thumbnail,topic:resource.topic,bookmarked:!resource.bookmarked});
   setResourceRefresh(value=>value+1);
   setNotice(resource.bookmarked?'Video removed from saved items.':'Video saved to your learning list.');
  }catch(error:any){
   setNotice(error?.message||'The video could not be saved.');
  }
 }

 async function auth(kind:'signin'|'signup'|'oauth',provider?:'google'|'github'|'linkedin_oidc'){
  if(kind==='oauth'){
   if(!supabase||!provider){setNotice('Supabase sign-in is unavailable.');return;}
  const {error}=await supabase.auth.signInWithOAuth({provider,options:{redirectTo:`${window.location.origin}/auth/callback?next=/workspace`}});
   if(error)setNotice(error.message);
   return;
  }
  router.push(kind==='signup'?'/auth/sign-up':'/auth/sign-in');
 }

 async function forgotPassword(){
  router.push('/auth/forgot-password');
 }
 async function signOut(){
  setBusy(true);
  setNotice('');
  try{
   if(supabase){
    const {error}=await supabase.auth.signOut({scope:'global'});
     if(error && !/session.*not found|invalid.*session|auth.*session/i.test(error.message)) throw error;
   }
   setSigned(false);
   try{window.sessionStorage.removeItem('buildbridge-screen');}catch{}
   clearRememberPreference();
   setWorkspaceData(null);
   setRole('student');
   setScreen('Dashboard');
   setPassword('');
   setName('');
   setEmail('');
   setNewEmail('');
   setPhoneNumber('');
   setAvatarPath('');
   setAvatarUrl('');
   setAvatarFile(null);
   setNewPassword('');
   setConfirmPassword('');
   setAiConversationId('');
   setAiMessages([]);
   setCompanyName('');
   activatedUserIdRef.current='';
   sessionActivationRef.current=false;
   window.history.replaceState(window.history.state, '', '/auth/sign-in');
   router.replace('/auth/sign-in');
   router.refresh();
  }catch(error:any){
   setNotice(error?.message||'Could not sign out. Please try again.');
  }finally{
   setBusy(false);
  }
 }
 async function aiAsk(promptOverride?:string|React.MouseEvent<HTMLButtonElement>){
  const prompt=(typeof promptOverride==='string'?promptOverride:query).trim();
  if(!prompt){setNotice('Enter a question for your AI mentor first.');return;}
  if(!supabase){setNotice('Supabase is not configured.');return;}
  if(aiRequestInFlightRef.current)return;
  aiRequestInFlightRef.current=true;
  setLastAiPrompt(prompt);
  setAiMentorError('');
  setBusy(true);setAiResponse('');
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const response=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({
    action:'mentor',prompt,pageContext:screen,projectId:screen==='Projects'?selectedProjectId||null:null,conversationId:aiConversationId||null,
   })});
   const result=await response.json().catch(()=>({error:'The AI service returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`AI request failed (${response.status}).`);
   if(!result.text||!result.conversationId)throw new Error('The AI Mentor returned an incomplete response. Please try again.');
   setAiConversationId(result.conversationId);
   setAiMessages(current=>[...current,{role:'user',content:prompt},{role:'assistant',content:result.text}]);
   setAiResponse(result.text);
   setQuery('');
  }catch(error:any){
   const message=error?.message||'';
   const unavailable=message.includes('temporarily experiencing high demand')||message.includes('not configured');
   const friendly=unavailable
    ? 'The AI Mentor is temporarily experiencing high demand. Please try again shortly. Your conversation has not been submitted successfully.'
    : message.includes('rate limit')
      ? 'The AI Mentor reached a provider rate limit. Please wait briefly and try again.'
      : 'The AI Mentor could not complete your request. Please try again shortly.';
   setAiMentorError(friendly);
   setNotice('');
  }finally{
   aiRequestInFlightRef.current=false;
   setBusy(false);
  }
 }
 function startNewMentorConversation(){
  setAiConversationId('');
  setAiMessages([]);
  setAiResponse('');
  setAiMentorError('');
  setLastAiPrompt('');
  setQuery('');
  setNotice('New conversation ready. Your next question will start a separate private history.');
 }
 async function clearMentorConversation(){
  if(!aiConversationId){startNewMentorConversation();return;}
  if(!supabase){setNotice('Supabase is not configured.');return;}
  setBusy(true);
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const response=await fetch('/api/ai',{method:'DELETE',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({conversationId:aiConversationId})});
   const result=await response.json().catch(()=>({error:'The Mentor service returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Could not clear the conversation (${response.status}).`);
   setAiConversationId('');
   setAiMessages([]);
   setAiResponse('');
   setAiMentorError('');
   setLastAiPrompt('');
   setQuery('');
   setNotice('The current mentor conversation and its saved messages were cleared.');
  }catch(error:any){setNotice(error?.message||'Could not clear this mentor conversation.');}
  finally{setBusy(false);}
 }
 function startMentorDrag(event:React.PointerEvent<HTMLButtonElement>){
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  mentorDragRef.current={pointerId:event.pointerId,offsetX:event.clientX-bounds.left,offsetY:event.clientY-bounds.top,startX:event.clientX,startY:event.clientY,moved:false};
  event.currentTarget.setPointerCapture(event.pointerId);
  setMentorDragging(true);
 }
 function moveMentorDrag(event:React.PointerEvent<HTMLButtonElement>){
  const drag=mentorDragRef.current;
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(Math.abs(event.clientX-drag.startX)>4||Math.abs(event.clientY-drag.startY)>4)drag.moved=true;
  if(!drag.moved)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  const position=clampFloatingPosition(event.clientX-drag.offsetX,event.clientY-drag.offsetY,bounds.width,bounds.height);
  setMentorPosition(position);
  setMentorAlign(floatingPanelAlign(position.x,bounds.width,window.innerWidth));
  const availableAbove=position.y-12;
  const availableBelow=window.innerHeight-position.y-bounds.height-12;
  const expectedPanelHeight=mentorPanelRef.current?.offsetHeight||420;
  setMentorPlacement(availableBelow>=Math.min(expectedPanelHeight,300)?'below':availableAbove>=availableBelow?'above':'below');
 }
 function endMentorDrag(event:React.PointerEvent<HTMLButtonElement>){
  const drag=mentorDragRef.current;
  if(!drag||drag.pointerId!==event.pointerId)return;
  if(drag.moved)mentorLastDragRef.current=Date.now();
  mentorDragRef.current=null;
  setMentorDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function toggleMentor(event:React.MouseEvent<HTMLButtonElement>){
  if(Date.now()-mentorLastDragRef.current<300){event.preventDefault();return;}
  if(!mentorOpen){
   const bounds=event.currentTarget.getBoundingClientRect();
   const above=bounds.top-12;
   const below=window.innerHeight-bounds.bottom-12;
   setMentorPlacement(below>=Math.min(mentorPanelRef.current?.offsetHeight||420,300)?'below':above>=below?'above':'below');
   setMentorAlign(floatingPanelAlign(bounds.left,bounds.width,window.innerWidth));
  }
  setMentorOpen(open=>!open);
 }
 async function checkBackend(){setBusy(true);try{const response=await fetch('/api/health',{cache:'no-store'});const result=await response.json();setBackendHealth(result);setNotice(result.supabaseReachable?'Supabase is reachable from the BuildBridge server.':'Supabase is not reachable or the server environment is incomplete.');}catch{setNotice('Could not reach the BuildBridge health endpoint. Check the Next.js terminal.');}finally{setBusy(false);}}
 async function sendAnnouncement(){
  if(!announcementSubject.trim()||announcementBody.trim().length<20){setNotice('Enter an announcement subject and a message of at least 20 characters.');return;}
  setBusy(true);
  try{
   const result=await authenticatedPost({action:'send_admin_announcement',subject:announcementSubject,body:announcementBody});
   setAnnouncementSubject('');
   setAnnouncementBody('');
   setNotice(`Announcement queued for ${result.data?.queuedRecipients||0} account recipient(s).`);
  }catch(error:any){setNotice(error?.message||'The announcement could not be queued.');}
  finally{setBusy(false);}
 }
 async function updateCareerGoal(){
  const nextGoal=goalDraft.trim();
  if(!careerPlans[nextGoal]){setNotice('Choose a supported career goal.');return;}
  setBusy(true);
  try{
   await authenticatedPost({action:'update_profile',careerGoal:nextGoal});
   setGoal(nextGoal);
   setGoalDraft(nextGoal);
   setResourceFilter('All');
   setResourceRefresh(value=>value+1);
   setNotice('Career goal saved. Your roadmap and learning recommendations are refreshing.');
   setModal('');
   await refreshWorkspace();
  }catch(error:any){setNotice(error?.message||'Could not save your career goal.');}
  finally{setBusy(false);}
 }
 async function generateCareerRoadmap(){
  if(!supabase){setRoadmapError('Supabase is not configured.');return;}
  setRoadmapLoading(true);
  setRoadmapError('');
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError)throw sessionError;
   if(!session?.access_token)throw new Error('Your sign-in session is missing. Sign in again.');
   const response=await fetch('/api/roadmap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'generate'})});
   const result=await response.json().catch(()=>({error:'The roadmap service returned an unreadable response.'}));
   if(!response.ok)throw new Error(result.error||`Roadmap generation failed (${response.status}).`);
   if(!result.roadmap||!Array.isArray(result.roadmap.steps))throw new Error('The roadmap service returned an invalid plan.');
   setRoadmapPlan(result.roadmap);
   setNotice('Your AI-personalized roadmap was generated and saved.');
  }catch(error:any){
   const message=error?.message||'Could not generate your roadmap.';
   setRoadmapError(message);
  }finally{setRoadmapLoading(false);}
 }
 function navigateLearningTopic(topic:string){
  setResourceFilter(topic);
  navigateToScreen('Learn');
  router.push(`/workspace?screen=Learn&topic=${encodeURIComponent(topic)}`,{scroll:false});
 }
 async function saveProfileDetails(){
  const fullName=name.trim();
  const phone=phoneNumber.trim();
  if(!fullName||fullName.length>120){setNotice('Enter a name between 1 and 120 characters.');return;}
  if(phone&&!/^\+?[0-9][0-9\s().-]{5,23}$/.test(phone)){setNotice('Enter a valid phone number, including country code if needed.');return;}
  if(!supabase){setNotice('Supabase is not configured.');return;}
  setBusy(true);
  let uploadedPath='';
  let profileSaved=false;
  try{
   let nextAvatarPath=avatarPath;
   if(avatarFile){
    if(!['image/jpeg','image/png','image/webp'].includes(avatarFile.type))throw new Error('Choose a JPG, PNG or WebP profile photo.');
    if(avatarFile.size>5*1024*1024)throw new Error('Profile photos must be 5 MB or smaller.');
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user)throw new Error('Your session has expired. Sign in again.');
    const extension=avatarFile.type==='image/png'?'png':avatarFile.type==='image/webp'?'webp':'jpg';
    uploadedPath=`${user.id}/avatar-${Date.now()}.${extension}`;
    const {error:uploadError}=await supabase.storage.from('profile-avatars').upload(uploadedPath,avatarFile,{upsert:false,contentType:avatarFile.type});
    if(uploadError)throw new Error(`Could not upload your profile photo: ${uploadError.message}`);
    nextAvatarPath=uploadedPath;
   }
   await authenticatedPost({action:'update_profile',fullName,phoneNumber:phone,avatarPath:nextAvatarPath});
   profileSaved=true;
   setAvatarPath(nextAvatarPath);
   setAvatarFile(null);
   if(nextAvatarPath){
    const {data:avatar,error:avatarError}=await supabase.storage.from('profile-avatars').createSignedUrl(nextAvatarPath,3600);
    if(avatarError)throw new Error(`Your profile was saved, but the photo could not be displayed: ${avatarError.message}`);
    setAvatarUrl(avatar.signedUrl);
   }else setAvatarUrl('');
   if(avatarPath&&avatarPath!==nextAvatarPath){
    const {error:removeError}=await supabase.storage.from('profile-avatars').remove([avatarPath]);
    if(removeError)throw new Error(`Your profile was saved, but the previous photo could not be removed: ${removeError.message}`);
   }
   setNotice('Profile details saved.');
   await refreshWorkspace();
  }catch(error:any){
   let message=error?.message||'Could not save your profile details.';
   if(uploadedPath&&!profileSaved){
    const {error:cleanupError}=await supabase.storage.from('profile-avatars').remove([uploadedPath]);
    if(cleanupError)message+=` The unused uploaded photo could not be removed: ${cleanupError.message}`;
   }
   setNotice(message);
  }finally{setBusy(false);}
 }
 async function changeLoginEmail(){
  const target=newEmail.trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)){setNotice('Enter a valid email address.');return;}
  if(target===email.toLowerCase()){setNotice('Enter a different email address.');return;}
  if(!supabase){setNotice('Supabase is not configured.');return;}
  setBusy(true);
  try{
   const {error}=await supabase.auth.updateUser({email:target},{emailRedirectTo:`${window.location.origin}/`});
   if(error)throw error;
   setNotice('Email change requested. Confirm the message sent by Supabase before using the new address to sign in.');
  }catch(error:any){setNotice(error?.message||'Could not request an email change.');}
  finally{setBusy(false);}
 }
 async function changeLoginPassword(){
  if(newPassword.length<8){setNotice('Use a new password with at least 8 characters.');return;}
  if(newPassword!==confirmPassword){setNotice('The new passwords do not match.');return;}
  if(!supabase){setNotice('Supabase is not configured.');return;}
  setBusy(true);
  try{
   const {error}=await supabase.auth.updateUser({password:newPassword});
   if(error)throw error;
   setNewPassword('');
   setConfirmPassword('');
   setNotice('Password changed successfully. Your password is never shown in your profile.');
  }catch(error:any){setNotice(error?.message||'Could not change your password. Sign in again if your session has expired.');}
  finally{setBusy(false);}
 }
 async function saveCompanyProfile(){if(!companyName.trim()){setNotice('Enter your organization name first.');return;}setBusy(true);try{await authenticatedPost({action:'create_company_profile',name:companyName.trim()});setNotice('Organization profile submitted. It is pending admin verification; project publishing remains locked until approval.');await refreshWorkspace();}catch(error:any){setNotice(error?.message||'Could not save company profile.');}finally{setBusy(false);}}
 async function applyOpportunity(opportunityId:string){setBusy(true);try{await authenticatedPost({action:'apply_opportunity',opportunityId});setApplications(current=>current.includes(opportunityId)?current:[...current,opportunityId]);setNotice('Application submitted.');await refreshWorkspace();}catch(error:any){setNotice(error?.message||'Could not submit application.');}finally{setBusy(false);}}
 async function verifyCompany(companyId:string){setBusy(true);try{await authenticatedPost({action:'verify_company',companyId});setNotice('Company verified. Its authorized project and opportunity workflows are now unlocked.');await refreshWorkspace();}catch(error:any){setNotice(error?.message||'Could not verify this company.');}finally{setBusy(false);}}
 async function reviewSubmission(decision:'approved'|'revision_requested'){
  if(!selectedSubmission?.id){setNotice('Select a submission to review.');return;}
  setBusy(true);try{await authenticatedPost({action:'review_submission',submissionId:selectedSubmission.id,decision,feedback:reviewFeedback});setModal('');setSelectedSubmission(null);setReviewFeedback('');setNotice(decision==='approved'?'Submission approved. Certificate issuance will follow the configured database workflow.':'Revision requested.');await refreshWorkspace();}catch(error:any){setNotice(error?.message||'Could not save the review.');}finally{setBusy(false);}
 }
 async function openSubmissionReview(submission:any){
  setSelectedSubmission(submission);
  setReviewFeedback('');
  setReviewEvidenceError('Preparing secure evidence access…');
  setModal('review');
  const storagePath=typeof submission.evidence?.storagePath==='string'?submission.evidence.storagePath:'';
  if(!storagePath){setReviewEvidenceError('This submission has no stored evidence file.');return;}
  if(!supabase){setReviewEvidenceError('Supabase is not configured.');return;}
  const {data,error}=await supabase.storage.from('project-evidence').createSignedUrl(storagePath,300);
  if(error){setReviewEvidenceError(`Evidence could not be opened: ${error.message}`);return;}
  setSelectedSubmission((current:any)=>current?.id===submission.id?{...current,evidenceUrl:data.signedUrl}:current);
 }
 const studentTourItems:[string,string,Screen][]=[['Find your direction','Choose a target role and understand the skills employers expect.','My Path'],['Map your coursework','Turn classes, syllabi and assignments into career-relevant skills.','My Path'],['Learn with intent','Follow videos matched to your career goal and demonstrated skill gaps.','Learn'],['Build real projects','Work through scoped milestones with progressive AI guidance.','Projects'],['Prove what you can do','Submit repositories, deployments, reports and validation evidence.','Projects'],['Get industry approval','Verified companies review deliverables before credentials are issued.','Opportunities']];
 const companyTourItems:[string,string,Screen][]=[['Set up your organization','Add your organization details in Company Profile.','Company Profile'],['Complete verification','An administrator reviews your organization before employer actions are unlocked.','Company Profile'],['Scope a real project','Create a clear project brief with deliverables and acceptance criteria.','Create Project'],['Prepare work for students','Define meaningful projects that students can complete and demonstrate.','Create Project'],['Review submitted evidence','Open the review queue and compare student evidence with your project scope.','Submissions'],['Close the feedback loop','Approve completed work or request specific revisions from the student.','Submissions']];
 const adminTourItems:[string,string,Screen][]=[['Verify organizations','Review organization details before granting access to employer workflows.','Company Verification'],['Moderate projects','Review project records and platform activity.','Project Moderation'],['Manage user access','Monitor student, company and administrator accounts.','Users & Access'],['Review platform controls','Inspect AI management and system settings.','AI Management'],['Resolve platform issues','Review disputes and outstanding operational concerns.','Disputes'],['Maintain the audit trail','Inspect recorded administrative activity.','Audit Trail']];
 const tourItems=role==='company_member'?companyTourItems:role==='admin'?adminTourItems:studentTourItems;
 const journeyIllustrations=role==='company_member'
  ?[{src:'/career-direction-illustration.svg',alt:'Organization goals and setup choices'},{src:'/industry-approval-illustration.svg',alt:'Organization verification and approval'},{src:'/project-building-illustration.svg',alt:'A scoped project being built on a laptop'},{src:'/coursework-mapping-illustration.svg',alt:'Project requirements mapped into work items'},{src:'/proof-of-work-illustration.svg',alt:'Student work evidence under review'},{src:'/opportunity-discovery-illustration.svg',alt:'An approved workflow opening opportunity paths'}]
  :role==='admin'
   ?[{src:'/industry-approval-illustration.svg',alt:'Organization verification and approval'},{src:'/project-building-illustration.svg',alt:'Project moderation workspace'},{src:'/career-direction-illustration.svg',alt:'User access and platform roles'},{src:'/focused-learning-illustration.svg',alt:'Platform controls and monitoring'},{src:'/coursework-mapping-illustration.svg',alt:'Dispute details organized for review'},{src:'/proof-of-work-illustration.svg',alt:'Administrative audit evidence'}]
   :[{src:'/career-direction-illustration.svg',alt:'A compass and career choices for finding direction'},{src:'/coursework-mapping-illustration.svg',alt:'Course topics mapped to relevant career skills'},{src:'/focused-learning-illustration.svg',alt:'A focused video lesson with skill checkpoints'},{src:'/project-building-illustration.svg',alt:'A student building a software project'},{src:'/proof-of-work-illustration.svg',alt:'A project report and verified work evidence'},{src:'/industry-approval-illustration.svg',alt:'A company approving a completed student project'}];
 const journeyStages=role==='company_member'
  ?[{name:'Onboard',detail:'Register your organization',icon:Building2,screen:'Company Profile' as Screen},{name:'Verify',detail:'Unlock employer actions',icon:ShieldCheck,screen:'Company Profile' as Screen},{name:'Scope',detail:'Create meaningful projects',icon:BriefcaseBusiness,screen:'Create Project' as Screen},{name:'Review',detail:'Assess student evidence',icon:CheckCircle2,screen:'Submissions' as Screen}]
  :role==='admin'
   ?[{name:'Verify',detail:'Review organizations',icon:ShieldCheck,screen:'Company Verification' as Screen},{name:'Moderate',detail:'Review project records',icon:FolderKanban,screen:'Project Moderation' as Screen},{name:'Govern',detail:'Manage platform access',icon:Settings,screen:'Users & Access' as Screen},{name:'Audit',detail:'Inspect platform activity',icon:FileText,screen:'Audit Trail' as Screen}]
   :STUDENT_JOURNEY_STAGES.map((stage,index)=>({name:stage.name,detail:stage.detail,icon:[GraduationCap,Code2,Upload,Award][index],screen:['Learn','Projects','Projects','Opportunities'][index] as Screen}));
 const title=screen==='Dashboard'?(role==='student'?'Your learning-to-work dashboard':role==='company_member'?'Company Dashboard':'Admin Operations'):screen;
 const workspaceReady=workspaceData!==null&&!workspaceLoading&&!workspaceError;
 const learningActivity=Array.isArray(workspaceData?.learningActivity)?workspaceData.learningActivity:[];
 const completedTopics=new Set(learningActivity.filter((item:any)=>item.action==='completed'&&item.topic).map((item:any)=>String(item.topic).trim().toLowerCase()));
 const activitySkills=[...new Map(learningActivity.filter((item:any)=>item.action==='completed'&&item.topic).map((item:any)=>[String(item.topic).toLowerCase(),{skill:item.topic}])).values()];
 const completedVideoRecords=[...new Map(learningActivity.filter((item:any)=>item.action==='completed'&&item.video_id).map((item:any)=>[String(item.video_id),item])).values()];
 const completedVideos=completedVideoRecords.slice(0,6);
 const skillCards=[{key:'studied',title:'Studied',subtitle:'From recorded learning activity',tone:'blue'},{key:'practiced',title:'Practiced',subtitle:'Applied skills',tone:'purple'},{key:'demonstrated',title:'Demonstrated',subtitle:'Shown in project work',tone:'orange'},{key:'company_verified',title:'Company verified',subtitle:'Validated by industry',tone:'green'}].map(card=>{
  const records=card.key==='studied'?[...(workspaceData?.skills||[]).filter((item:any)=>item.status===card.key),...activitySkills]:(workspaceData?.skills||[]).filter((item:any)=>item.status===card.key);
  return {...card,items:card.key==='studied'?[...new Map(records.map((item:any)=>[String(item.skill||'').toLowerCase(),item])).values()]:records};
 });
 const liveProjects=Array.isArray(workspaceData?.projects)?workspaceData.projects:[];
 const liveOpportunities=Array.isArray(workspaceData?.opportunities)?workspaceData.opportunities.filter((item:any)=>item.status==='published'):[];
 const liveSubmissions=Array.isArray(workspaceData?.submissions)?workspaceData.submissions:[];
 const getProjectName=(projectId:string)=>liveProjects.find((project:any)=>project.id===projectId)?.title||`Project ${String(projectId).slice(0,8)}`;
 const getMilestoneName=(submission:any)=>liveProjects.find((project:any)=>project.id===submission.project_id)?.project_milestones?.find((milestone:any)=>milestone.id===submission.milestone_id)?.title||'Project milestone';
 const liveAssignments=Array.isArray(workspaceData?.assignments)?workspaceData.assignments:[];
 const assignmentMilestones=Array.isArray(workspaceData?.assignmentMilestones)?workspaceData.assignmentMilestones:[];
 const activeProjectCount=liveAssignments.length
  ? liveAssignments.filter((item:any)=>!['completed','approved','cancelled','withdrawn','rejected','archived'].includes(String(item.status||'').toLowerCase())).length
  : new Set(liveSubmissions.filter((item:any)=>item.company_decision!=='approved').map((item:any)=>item.project_id)).size;
 const completedMilestoneCount=assignmentMilestones.length
  ? assignmentMilestones.filter((item:any)=>['approved','completed','accepted'].includes(String(item.status||'').toLowerCase())).length
  : new Set(liveSubmissions.filter((item:any)=>item.company_decision==='approved').map((item:any)=>item.milestone_id||item.id)).size;
 const issuedCertificateCount=Array.isArray(workspaceData?.certificates)?workspaceData.certificates.length:0;
 const liveApplications=Array.isArray(workspaceData?.applications)?workspaceData.applications:[];
 const applicationCount=liveApplications.length;
 const pendingApplicationCount=liveApplications.filter((item:any)=>['applied','pending','under_review','submitted'].includes(String(item.status||'').toLowerCase())).length;
 const demonstratedSkillNames=new Set(skillCards.filter(card=>card.key==='demonstrated'||card.key==='company_verified').flatMap(card=>card.items.map((item:any)=>String(item.skill||'').trim().toLowerCase())).filter(Boolean));
 const profile=workspaceData?.profile||initialProfile;
 const matchedOpportunities=liveOpportunities.map((opportunity:any)=>{
  const required=Array.isArray(opportunity.required_skills)?opportunity.required_skills.filter((item:any)=>typeof item==='string'&&item.trim()):[];
  const targets=Array.isArray(opportunity.career_goals)?opportunity.career_goals.filter((item:any)=>typeof item==='string'&&item.trim()):[];
  const matchedSkills=required.filter((skill:string)=>demonstratedSkillNames.has(skill.toLowerCase()));
  const goalMatch=targets.length===0||targets.some((target:string)=>goal.toLowerCase().includes(target.toLowerCase())||target.toLowerCase().includes(goal.toLowerCase()));
  const skillScore=required.length?matchedSkills.length/required.length:0;
  const profileEducation=String(profile?.education_level||'').toLowerCase();
  const profileYear=String(profile?.academic_year||'').toLowerCase();
  const profileLocation=String(profile?.location||'').toLowerCase();
  const profileCgpa=profile?.cgpa===null||profile?.cgpa===undefined?'':Number(profile.cgpa);
  const eligibility=typeof opportunity.eligibility==='string'?{description:opportunity.eligibility}:opportunity.eligibility||{};
  const checks:boolean[]=[];const missingChecks:string[]=[];
  if(eligibility.minimumEducationLevel){if(profileEducation)checks.push(profileEducation.includes(String(eligibility.minimumEducationLevel).toLowerCase()));else missingChecks.push('education level');}
  if(eligibility.minimumAcademicYear){if(profileYear)checks.push(profileYear.includes(String(eligibility.minimumAcademicYear).toLowerCase()));else missingChecks.push('academic year');}
  if(Number(eligibility.minimumCgpa)>0){if(profileCgpa!=='')checks.push(Number(profileCgpa)>=Number(eligibility.minimumCgpa));else missingChecks.push('CGPA / percentage');}
  if(Array.isArray(eligibility.eligibleLocations)&&eligibility.eligibleLocations.length){if(profileLocation)checks.push(eligibility.eligibleLocations.some((location:string)=>profileLocation.includes(String(location).toLowerCase())||String(location).toLowerCase().includes(profileLocation)));else missingChecks.push('location');}
  const eligibilityDetails=[eligibility.minimumEducationLevel?`Education: ${eligibility.minimumEducationLevel}`:'',eligibility.minimumAcademicYear?`Year: ${eligibility.minimumAcademicYear}`:'',Number(eligibility.minimumCgpa)>0?`Minimum CGPA / percentage: ${eligibility.minimumCgpa}`:'',Array.isArray(eligibility.eligibleLocations)&&eligibility.eligibleLocations.length?`Locations: ${eligibility.eligibleLocations.join(', ')}`:''].filter(Boolean);
  const eligibilityPassed=checks.length>0&&checks.every(Boolean)&&missingChecks.length===0;
  const eligibilityFailed=checks.some(value=>!value);
  const eligibilityStatus=eligibilityFailed?'Does not match one or more stated profile requirements':missingChecks.length?`Add ${missingChecks.join(', ')} to your profile to verify eligibility`:checks.length?'Matches stated profile requirements':'Review publisher requirements';
  const score=(required.length?skillScore*.7:0)+(targets.length?(goalMatch ? 0.2 : 0):0)+(eligibilityPassed ? 0.1 : 0);
  const matchLabel=!required.length&&!targets.length?'Requirements not specified':score>=.6?'Strong evidence match':score>=.25?'Partial evidence match':'Build more evidence first';
  const matchReason=required.length?`${matchedSkills.length} of ${required.length} required skills match your demonstrated or company-verified evidence${targets.length?(goalMatch?' and your career goal':''):''}.`:targets.length?(goalMatch?'This opportunity targets your current career goal.':'This opportunity targets a different career goal.'):'The publisher has not supplied structured skill or career requirements.';
  const application=liveApplications.find((item:any)=>item.opportunity_id===opportunity.id);
  const eligibilityDescription=typeof eligibility.description==='string'?eligibility.description:'';
  return {...opportunity,matchedSkills,matchLabel,matchReason,matchScore:score,goalMatch,application,eligibility:eligibilityDescription,eligibilityDetails,eligibilityStatus};
 }).sort((a:any,b:any)=>b.matchScore-a.matchScore);
 const liveCompanies=Array.isArray(workspaceData?.companies)?workspaceData.companies:[];
 const liveUsers=Array.isArray(workspaceData?.users)?workspaceData.users:[];
 const liveCompanyRequests=Array.isArray(workspaceData?.companyRequests)?workspaceData.companyRequests:[];
 const careerPlan=careerPlans[goal]||careerPlans['Data Analyst'];
 const completedSkills=new Set(recommendationContext.split(',').filter(Boolean));
 const learningTopics=careerPlan.focus.filter(skill=>!completedSkills.has(skill.toLowerCase())&&!completedTopics.has(skill.toLowerCase()));
 const activeLearningTopics=learningTopics.length?learningTopics:careerPlan.focus;
 const roadmapSource=roadmapPlan?.career_goal===goal&&Array.isArray(roadmapPlan.steps)?roadmapPlan.steps:careerPlan.roadmap.map((title,index)=>({
  title,
  explanation:'Build the foundation, practice the concept and apply it to a small real-world task.',
  requiredSkills:[careerPlan.focus[index%careerPlan.focus.length]],
  learningTopics:[careerPlan.focus[index%careerPlan.focus.length]],
  completionCriteria:'Complete a topic-matched learning resource or demonstrate the skill through project evidence.',
 }));
 const roadmapSteps=roadmapSource.map((step:any)=>{
  const requiredSkills=Array.isArray(step.requiredSkills)?step.requiredSkills:[];
  const learningTopics=Array.isArray(step.learningTopics)?step.learningTopics:[];
  const topic=String(learningTopics[0]||requiredSkills[0]||careerPlan.focus[0]);
  const topicKey=topic.toLowerCase();
  const completed=learningActivity.some((item:any)=>item.action==='completed'&&String(item.topic||'').toLowerCase()===topicKey)
   ||requiredSkills.some((skill:string)=>(workspaceData?.skills||[]).some((item:any)=>String(item.skill||'').toLowerCase()===skill.toLowerCase()&&(item.status==='demonstrated'||item.status==='company_verified')));
  const submission=liveSubmissions.find((item:any)=>item.company_decision!=='approved'&&liveProjects.some((project:any)=>project.id===item.project_id));
  const relatedProject=submission?liveProjects.find((project:any)=>project.id===submission.project_id):null;
  return {...step,requiredSkills,learningTopics,topic,completed,relatedProject};
 });
 const opportunityCategoryTerm=opportunityCategory==='Internships'?'internship':opportunityCategory==='Entry-level jobs'?'entry-level job':opportunityCategory==='Remote opportunities'?'remote job':'real-world project opportunity';
 const opportunityQuery=[goal,opportunityCategoryTerm,activeLearningTopics.slice(0,2).join(' '),opportunityKeyword.trim(),'India'].filter(Boolean).join(' ');
 const opportunitySlug=opportunityQuery.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const encodedOpportunityQuery=encodeURIComponent(opportunityQuery);
 const opportunitySources=opportunityCategory==='Projects'
  ?[{name:'Google Search',detail:'Project challenges and portfolio opportunities',href:`https://www.google.com/search?q=${encodeURIComponent(`${opportunityQuery} project challenge`)}`},{name:'Unstop',detail:'Student challenges, hackathons and competitions',href:`https://www.google.com/search?q=${encodeURIComponent(`site:unstop.com ${opportunityQuery} challenge`)}`},{name:'LinkedIn',detail:'Project and volunteer opportunities',href:`https://www.linkedin.com/jobs/search/?keywords=${encodedOpportunityQuery}&location=India`}]
  :[{name:'Google Jobs',detail:'Open roles across the web',href:`https://www.google.com/search?q=${encodedOpportunityQuery}&ibp=htl;jobs`},{name:'LinkedIn',detail:'Roles from employers and recruiters',href:`https://www.linkedin.com/jobs/search/?keywords=${encodedOpportunityQuery}&location=India${opportunityCategory==='Remote opportunities'?'&f_WT=2':''}`},{name:'Indeed India',detail:'Job listings across India',href:`https://in.indeed.com/jobs?q=${encodedOpportunityQuery}&l=India`},...(opportunityCategory==='Internships'?[{name:'Internshala',detail:'India-focused internship listings',href:`https://internshala.com/internships/keywords-${opportunitySlug}/`}]:[{name:'Naukri.com',detail:'India-focused job listings',href:`https://www.naukri.com/jobs-in-india?keyword=${encodedOpportunityQuery}`}])];
 const searchItems=[
  ...liveProjects.map((item:any)=>({title:item.title,detail:item.scope||'Project',screen:(role==='student'?'Projects':role==='admin'?'Project Moderation':'Dashboard') as Screen})),
  ...liveOpportunities.map((item:any)=>({title:item.title,detail:item.scope||'Opportunity',screen:(role==='student'?'Opportunities':role==='admin'?'Project Moderation':'Opportunities') as Screen})),
  ...liveSubmissions.map((item:any)=>({title:`Submission · ${item.status}`,detail:`Project ${String(item.project_id||'').slice(0,8)}`,screen:(role==='company_member'?'Submissions':'Projects') as Screen})),
  ...(workspaceData?.certificates||[]).map((item:any)=>({title:item.certificate_type?.replaceAll('_',' ')||'Certificate',detail:`Project ${String(item.project_id||'').slice(0,8)}`,screen:'Achievements' as Screen})),
  ...(workspaceData?.skills||[]).map((item:any)=>({title:item.skill,detail:`${item.status} skill`,screen:'Dashboard' as Screen})),
  ...liveCompanies.map((item:any)=>({title:item.name,detail:'Organization',screen:'Company Verification' as Screen})),
  ...liveUsers.map((item:any)=>({title:item.full_name||item.email||'User',detail:item.role,screen:'Users & Access' as Screen})),
  ...(role==='student'?careerPlan.focus.map(topic=>({title:topic,detail:`Learning topic for ${goal}`,screen:'Learn' as Screen})):[]),
 ].filter(item=>item.title&&`${item.title} ${item.detail}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).slice(0,8);
 const uniqueSavedResources=savedResources
  .filter((resource:any)=>!recommendedResources.some((item:any)=>item.videoId===resource.video_id))
  .map((resource:any)=>({...resource,videoId:resource.video_id,bookmarked:true}));
 const creators=[...new Set(recommendedResources.map((resource:any)=>String(resource.channel||'YouTube creator')).filter(Boolean))].sort();
 const durationSeconds=(duration:string)=>{
  const parts=String(duration||'').split(':').map((value)=>Number(value||0));
  if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
  if(parts.length===2)return parts[0]*60+parts[1];
  return 0;
 };
 const filteredRecommendedResources=recommendedResources.filter((resource:any)=>{
  const seconds=durationSeconds(resource.duration);
  if(durationFilter==='Under 5 minutes'&&!(seconds>0&&seconds<300))return false;
  if(durationFilter==='5–15 minutes'&&!(seconds>=300&&seconds<=900))return false;
  if(durationFilter==='15–30 minutes'&&!(seconds>900&&seconds<=1800))return false;
  if(durationFilter==='30–60 minutes'&&!(seconds>1800&&seconds<=3600))return false;
  if(durationFilter==='Over 60 minutes'&&!(seconds>3600))return false;
  if(creatorFilter!='Any creator'&&String(resource.channel||'YouTube creator')!==creatorFilter)return false;
  return true;
 });
  const renderResourceCard=(resource:any,index:number)=>(
   <article className="resource-card" key={resource.videoId||resource.video_id}>
    <button type="button" className={`video-thumb ${['blue','purple','navy'][index%3]}`} onClick={()=>openLearningVideo(resource)} aria-label={`Play ${resource.title} in BuildBridge`}>
     <BookOpen size={34}/>
     {resource.thumbnail?<img src={resource.thumbnail} alt="" loading="lazy" onError={(event)=>event.currentTarget.remove()}/>:null}
     {resource.duration&&<span>{resource.duration}</span>}
    </button>
    <div className="resource-info">
     <h3>{resource.title}</h3>
     <p>{resource.channel||'YouTube creator'} · {Number(resource.views||0).toLocaleString()} views</p>
     {resource.description&&<p>{resource.description}</p>}
     <div className="tag-row"><Pill tone="blue">{resource.topic||goal}</Pill></div>
     <div className="resource-actions">
      <button type="button" className="outline" onClick={()=>openLearningVideo(resource)}>Watch in BuildBridge <PlayCircle size={14}/></button>
      <a className="text-btn" href={`https://www.youtube.com/watch?v=${normalizeYouTubeVideoId(resource.videoId||resource.video_id||resource.url||resource.watchUrl)||''}`} target="_blank" rel="noopener noreferrer" onClick={(event)=>{const videoId=normalizeYouTubeVideoId(resource.videoId||resource.video_id||resource.url||resource.watchUrl);if(!videoId){event.preventDefault();setNotice('This resource does not contain a usable YouTube video ID.');return;}void saveLearningActivity({...resource,videoId},'opened');}}>Open YouTube <ExternalLink size={14}/></a>
      <button type="button" className="text-btn" onClick={()=>{const videoId=normalizeYouTubeVideoId(resource.videoId||resource.video_id||resource.url||resource.watchUrl);if(!videoId){setNotice('This resource does not contain a usable YouTube video ID.');return;}void toggleLearningBookmark({...resource,videoId});}}>{resource.bookmarked?<BookmarkCheck size={15}/>:<Bookmark size={15}/>} {resource.bookmarked?'Saved':'Save'}</button>
     </div>
    </div>
   </article>
  );
 if(authChecking)return <main className={dark?'app dark':'app'}><div className="auth-loading"><Brand/><p>Checking your secure BuildBridge session…</p></div></main>;
 if(!signed)return <main className={dark?'app dark':'app'}><div className="auth-loading"><Brand/><p>Your session has ended. <a href="/auth/sign-in">Sign in again</a>.</p></div></main>;
  if(companyPortal&&role==='student')return <main className={dark?'app dark':'app'}><div className="content company-onboarding-page"><div className="page-heading"><div><p className="eyebrow">COMPANY PORTAL</p><h1>Organization verification</h1><p className="muted">Submit company evidence for manual administrator review. Student features remain separate.</p></div><button className="outline" onClick={signOut} disabled={busy}>Sign out</button></div><CompanyDomainRequest/></div></main>;
 return <main className={dark?'app dark':'app'}><aside className={'sidebar '+(mobile?'open':'')}><div className="side-head"><Brand/ ><button className="icon-btn mobile-close" onClick={()=>setMobile(false)}><X/></button></div><div className="workspace-label">{role==='student'?'STUDENT WORKSPACE':role==='company_member'?'COMPANY WORKSPACE':'ADMIN CONSOLE'}</div><nav>{nav.map(({name:n,icon:Icon})=><button key={n} className={screen===n?'selected':''} onClick={()=>{setScreen(n);setMobile(false)}}><Icon size={18}/><span>{n}</span>{n==='Opportunities'&&liveOpportunities.length>0&&<i>{liveOpportunities.length}</i>}</button>)}</nav><div className="side-bottom"><button className="mini-profile profile-link" type="button" aria-label="Open profile" onClick={()=>{setScreen('Profile');setMobile(false)}}><ProfileAvatar src={avatarUrl} name={role==='company_member'?(companyName||name):name||email||'U'}/><span><b>{role==='company_member'?(companyName||name||'Your organization'):role==='admin'?(name||email||'Administrator'):(name||'BuildBridge member')}</b><small>{role==='student'?'Student':role==='company_member'?(workspaceData?.company?.verified?'Verified company':'Company · verification pending'):'Administrator'}</small></span></button><button className="nav-button" onClick={signOut}><LogOut size={17}/> Sign out</button></div></aside><section className="main-area"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div className="crumb">Workspace <ChevronRight size={14}/><b>{screen}</b></div><div className="top-actions"><div className="search"><Search size={16}/><input aria-label="Search workspace" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&searchItems[0]){setScreen(searchItems[0].screen);setSearchQuery('');}}} placeholder="Search anything..."/>{searchQuery&&<div className="search-results">{searchItems.length?searchItems.map((item,index)=><button key={`${item.screen}-${item.title}-${index}`} onClick={()=>{setScreen(item.screen);setSearchQuery('');}}><b>{item.title}</b><small>{item.detail}</small></button>):<p>No matching workspace records.</p>}</div>}</div><button className="icon-btn" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}</button><NotificationCenter/><button className="top-account profile-navigation" type="button" title={email} aria-label="Open profile" onClick={()=>setScreen('Profile')}><ProfileAvatar src={avatarUrl} name={name||email||'U'}/><span>{email}</span></button><button className="top-signout" onClick={signOut} disabled={busy} aria-label="Sign out of BuildBridge" title="Sign out"><LogOut size={16}/><span>{busy?'Signing out…':'Sign out'}</span></button></div></header><div className="content">
 <section className="journey-panel" data-step={tourStep} aria-label={role==='company_member'?'Company workflow tour':'Your Build Journey'}>
  <div className="journey-head">
   <div><p className="journey-kicker">{role==='company_member'?'YOUR COMPANY WORKFLOW':role==='admin'?'PLATFORM OPERATIONS':'YOUR BUILD JOURNEY'}</p><h2>{role==='company_member'?'Define it. Scope it. Review it. Grow it.':role==='admin'?'Verify, govern and protect the platform.':'Learn it. Build it. Prove it. Earn from it.'}</h2><p className="journey-subtitle">{role==='company_member'?'Onboard your organization, create meaningful projects and review student evidence.':role==='admin'?'A guided path through organization review, project moderation and platform oversight.':'A guided path from what you study to work you can demonstrate.'}</p></div>
   <div className="journey-head-actions"><button className="journey-control" onClick={()=>setTourPaused(!tourPaused)}>{tourPaused?'Resume tour':'Pause tour'}</button><button className="journey-control journey-collapse" onClick={()=>setTour(!tour)}>{tour?'Hide walkthrough':'Show walkthrough'}</button></div>
  </div>
  <div className="journey-track">
   {journeyStages.map((stage,i)=>{const Icon=stage.icon;const activeStage=role==='student'?(tourStep<3?0:tourStep===3?1:tourStep===4?2:3):tourStep===0?0:tourStep===1?1:tourStep<=3?2:3;return <button key={stage.name} className={'journey-stage '+(i===activeStage?'active':'')+(i<activeStage?' complete':'')} onClick={()=>navigateToScreen(stage.screen)}><span className="journey-stage-icon"><Icon size={20}/></span><span className="journey-stage-copy"><b>{stage.name}</b><small>{stage.detail}</small></span><span className="journey-stage-arrow">{i<3?'→':''}</span></button>})}
  </div>
  {tour&&<div className="journey-current">
   <div className="journey-current-copy"><div className="journey-step-line"><span>STEP {tourStep+1} OF 6</span><span className="journey-auto">{tourPaused?'Paused':'Auto advances every 4 seconds'}</span></div><h3>{tourItems[tourStep][0]}</h3><p>{tourItems[tourStep][1]}</p></div>
   <img className="journey-current-image" src={journeyIllustrations[tourStep].src} alt={journeyIllustrations[tourStep].alt}/>
   <div className="journey-current-actions"><div className="journey-dots">{tourItems.map((_,i)=><button aria-label={'Go to journey step '+(i+1)} className={i===tourStep?'on':''} key={i} onClick={()=>setTourStep(i)}/>)}</div><button className="journey-explore" onClick={()=>navigateToScreen(tourItems[tourStep][2])}>Explore this step <ChevronRight size={16}/></button>
   </div>
  </div>}
 </section>
 {workspaceError&&<div className="notice workspace-error"><span>{workspaceError}</span><button className="text-btn" onClick={refreshWorkspace}>Retry</button></div>}
 {screen==='Dashboard'&&role!=='student'&&workspaceLoading&&<div className="empty-state" role="status"><Sparkles size={28}/><h3>Loading your workspace data</h3><p>Dashboard metrics are shown after records are retrieved.</p></div>}
 {screen==='Dashboard'&&role!=='student'&&!workspaceReady&&!workspaceLoading&&!workspaceError&&<div className="empty-state"><CircleHelp size={32}/><h3>Workspace data is not ready</h3><button className="outline" onClick={refreshWorkspace}>Retry</button></div>}
 <div className="page-heading" id="workspace-content" ref={workspaceContentRef}><div><p className="eyebrow">{role==='student'?'YOUR CAREER, IN MOTION':role==='company_member'?'EMPLOYER WORKSPACE':'PLATFORM CONTROL'}</p><h1>{title}</h1><p className="muted">{role==='student'?`Good morning, ${name}. Here's your personalized learning and work plan.`:role==='company_member'?'Manage your organization, publish real-world projects, review submissions and connect with emerging talent.':'Review platform operations, organizations and governance activity.'}</p></div><div className="heading-actions"><Pill>{role==='student'?'Career target: '+goal:role==='company_member'?'Verified organization':'System healthy'}</Pill>{role==='student'&&<button className="primary" onClick={()=>{setGoalDraft(goal);setModal('goal')}}>Update career goal</button>}{role==='company_member'&&<button className="primary" onClick={()=>setScreen('Create Project')}>+ Create New Project</button>}</div></div>
 {screen==='Profile'&&<div className="profile-page">
  <section className="profile-hero panel">
   <div className="profile-photo-wrap"><ProfileAvatar src={avatarPreview||avatarUrl} name={name} className="avatar profile-avatar"/><label className="avatar-upload"><Camera size={16}/> Change photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setAvatarFile(event.target.files?.[0]||null)}/></label></div>
   <div className="profile-hero-copy"><p className="eyebrow">ACCOUNT PROFILE</p><h2>{name||'Your profile'}</h2><p className="muted">{role==='student'?'Student account':role==='company_member'?'Company account':'Administrator account'} · Update your personal and login details securely.</p><Pill tone="blue">{role==='company_member'?'Company member':role}</Pill></div>
  </section>
  <div className="profile-grid">
   <section className="panel profile-section">
    <h2><UserRound size={19}/> Personal details</h2>
    <label>Full name<input value={name} maxLength={120} onChange={event=>setName(event.target.value)} autoComplete="name"/></label>
    <label>Phone number<input type="tel" value={phoneNumber} onChange={event=>setPhoneNumber(event.target.value)} placeholder="+91 98765 43210" autoComplete="tel"/></label>
    <button className="primary" disabled={busy} onClick={saveProfileDetails}>{busy?'Saving…':'Save profile details'}</button>
   </section>
   <section className="panel profile-section">
    <h2><Mail size={19}/> Login email</h2>
    <label>Current email<input type="email" value={email} readOnly/></label>
    <label>New email<input type="email" value={newEmail} onChange={event=>setNewEmail(event.target.value)} autoComplete="email" placeholder="you@example.com"/></label>
    <p className="muted">Supabase sends a confirmation message. The new address becomes your login after confirmation.</p>
    <button className="outline" disabled={busy} onClick={changeLoginEmail}>Request email change</button>
   </section>
   <section className="panel profile-section">
    <h2><KeyRound size={19}/> Password</h2>
    <p className="password-privacy"><LockKeyhole size={17}/> For your security, your current password is never shown or stored in your profile.</p>
    <label>New password<input type="password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} placeholder="At least 8 characters"/></label>
    <label>Confirm new password<input type="password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} placeholder="Enter the new password again"/></label>
    <button className="outline" disabled={busy||!newPassword||!confirmPassword} onClick={changeLoginPassword}>Change password</button>
   </section>
  </div>
  {role==='student'&&<ExtendedProfileFields/>}
  {role==='company_member'&&<><CompanyDomainRequest/><CompanyCertificateAuthorization verified={Boolean(workspaceData?.company?.verified)} signatory={workspaceData?.certificateSignatory||null} onSaved={()=>void refreshWorkspace()}/></>}
 </div>}
 {role==='student'&&screen==='Dashboard'&&(workspaceLoading?<div className="empty-state" role="status"><Sparkles size={28}/><h3>Loading your workspace data</h3><p>Your real activity and evidence are being retrieved.</p></div>:workspaceError?<div className="empty-state" role="alert"><CircleHelp size={32}/><h3>Dashboard data could not be loaded</h3><p>{workspaceError}</p><button className="outline" onClick={refreshWorkspace}>Retry</button></div>:workspaceData?<><div className="metric-grid student-metrics">{[
  [String(skillCards.find(x=>x.key==='studied')?.items.length||0),'Studied skills','Learn'],
  [String(skillCards.find(x=>x.key==='practiced')?.items.length||0),'Practiced skills','Projects'],
  [String(skillCards.find(x=>x.key==='demonstrated')?.items.length||0),'Demonstrated skills','My Projects'],
  [String(skillCards.find(x=>x.key==='company_verified')?.items.length||0),'Company-verified skills','Achievements'],
  [String(activeProjectCount),'Active projects','My Projects'],
  [String(completedMilestoneCount),'Completed milestones','My Projects'],
  [String(issuedCertificateCount),'Certificates issued','Achievements'],
  [String(pendingApplicationCount),'Pending applications','Opportunities'],
 ].map(([value,label,destination])=><button type="button" className="metric metric-action" key={label} onClick={()=>setScreen(destination as Screen)}><b>{value}</b><small>{label}</small><span>Open {destination} →</span></button>)}</div><div className="stat-grid"><div className="goal-card"><div className="goal-icon"><Compass/></div><div><small>YOUR CAREER TARGET</small><h2>{goal}</h2><p>Your target helps organize learning, projects and opportunities around the role you want to pursue.</p></div><button className="text-btn" onClick={()=>{setGoalDraft(goal);setModal('goal')}}>Change <ChevronRight size={14}/></button></div><div className="next-card"><h3><Sparkles/> Next best actions</h3><ol><li><span>1</span><div><b>{liveProjects.length?'Explore project work':'Build a portfolio project'}</b><small>{liveProjects.length?`${liveProjects.length} published project(s) are available`:'Explore Learn and submit evidence when a project is available'}</small></div></li><li><span>2</span><div><b>Build demonstrated skills</b><small>{skillCards.find(x=>x.key==='demonstrated')?.items.length||0} demonstrated skill records so far</small></div></li><li><span>3</span><div><b>Review matching opportunities</b><small>{liveOpportunities.length} published opportunities currently available</small></div></li></ol></div></div><div className="section-title"><h2>Your skills at a glance</h2><span className="muted">Based on learning activity and evidence records</span></div><div className="skill-grid">{skillCards.map(card=><div className="skill-card" key={card.key}><b>{card.title}</b><small>{card.subtitle}</small><p>{card.items.length?card.items.map((item:any)=>item.skill).join(', '):'No records yet'}</p><Pill tone={card.tone}>{card.items.length?`${card.items.length} recorded`:'Not started'}</Pill></div>)}</div></>:<div className="empty-state"><CircleHelp size={32}/><h3>Your workspace data is not ready</h3><p>Refresh your authenticated workspace to retrieve your real records.</p><button className="outline" onClick={refreshWorkspace}>Retry</button></div>)}
 {role==='student'&&screen==='Learn'&&<>
  <section className="learning-hero">
   <div><p className="journey-kicker">YOUR NEXT SKILL, CLEARLY</p><h2>Learn toward {goal}</h2><p>Real YouTube videos are recommended using your career goal and focus skills. Save videos, track what you watch and return to your learning history.</p><div className="learning-proof"><span><CheckCircle2 size={16}/> Career-matched videos</span><span><Sparkles size={16}/> Live YouTube recommendations</span></div></div>
   <img src="/learning-path-illustration.svg" alt="Illustration of a laptop, learning notes and a growing skills chart"/>
  </section>
  {selectedLearningVideo&&<div ref={learningPlayerRef} className="learning-player-wrap"><YouTubeWatchPlayer videoId={selectedLearningVideo.videoId||selectedLearningVideo.video_id} title={selectedLearningVideo.title} onStarted={handleLearningVideoStarted} onCompleted={handleLearningVideoCompleted} onClose={closeLearningVideo} initialPosition={learningPlaybackPosition} onPosition={handleLearningPlaybackPosition}/></div>}
  <div className="section-title"><h2>Recommended videos</h2><div className="inline-actions"><Pill tone="purple">{goal}</Pill><Pill tone="green">{completedVideoRecords.length} completed</Pill><button className="outline" disabled={resourceLoading} onClick={()=>setResourceRefresh(value=>value+1)}>{resourceLoading?'Refreshing…':'Refresh videos'}</button></div></div>
  <p className="muted">Videos come from YouTube and are matched to your career goal and selected skill. Confirm video quality and relevance before relying on a resource.</p>
  <div className="filter-row">{['All',...careerPlan.focus].map(topic=><button key={topic} className={resourceFilter===topic?'filter active-filter':'filter'} onClick={()=>setResourceFilter(topic)}>{topic}</button>)}</div>
  <div className="project-filters learning-resource-filters" role="search">
   <label>Duration<select value={durationFilter} onChange={event=>setDurationFilter(event.target.value)}>{['Any duration','Under 5 minutes','5–15 minutes','15–30 minutes','30–60 minutes','Over 60 minutes'].map(item=><option key={item}>{item}</option>)}</select></label>
   <label>Creator<select value={creatorFilter} onChange={event=>setCreatorFilter(event.target.value)}><option>Any creator</option>{creators.map(item=><option key={item}>{item}</option>)}</select></label>
   <button type="button" className="outline" onClick={()=>{setDurationFilter('Any duration');setCreatorFilter('Any creator');setResourceFilter('All');}}>Reset filters</button>
  </div>
  {resourceError&&<div className="recommendation-error" role="alert">{resourceError}<button className="text-btn" onClick={()=>setResourceRefresh(value=>value+1)}>Try again</button></div>}
  {resourceLoading?<div className="resource-grid" aria-label="Loading videos">{[0,1,2].map(index=><div className="resource-card" key={index}><div className="resource-skeleton-thumb"/><div className="resource-info"><div className="resource-skeleton-line"/><div className="resource-skeleton-line short"/></div></div>)}</div>
   :filteredRecommendedResources.length?<div className="resource-grid">{filteredRecommendedResources.map(renderResourceCard)}</div>
   :!resourceError&&<div className="empty-state"><BookOpen size={36}/><h3>{recommendedResources.length?'No videos match these filters':'No videos found for this topic'}</h3><p>{recommendedResources.length?'Reset duration or creator filters to see more recommendations.':'Try another focus skill or refresh recommendations.'}</p></div>}
  {savedResources.length>0&&<section className="learning-history"><div className="section-title"><h2>Saved videos</h2><Pill tone="purple">{savedResources.length} saved</Pill></div>{uniqueSavedResources.length?<div className="resource-grid">{uniqueSavedResources.map(renderResourceCard)}</div>:<p className="muted">Your saved videos are included in the recommendations above.</p>}</section>}
  {completedVideos.length>0&&<section className="learning-history"><div className="section-title"><h2>Recently watched</h2><Pill tone="blue">{completedVideos.length} completed</Pill></div><div className="resource-grid">{completedVideos.map((item:any,index:number)=>renderResourceCard({video_id:item.video_id,title:item.title,channel:item.channel,thumbnail:item.thumbnail,topic:item.topic,bookmarked:false},index))}</div></section>}
  <p className="footnote">Videos and public statistics are provided by YouTube. BuildBridge does not access private YouTube watch history; only actions you record here are saved.</p>
 </>}
 {role==='company_member'&&screen==='Opportunities'&&<OpportunityManagement opportunities={workspaceData?.opportunities||[]} verified={workspaceData?.company?.verified===true} ownerId={initialProfile.id} onRefresh={refreshWorkspace}/> }
 {role==='student'&&screen==='Opportunities'&&<>
  <section className="opportunity-hero"><div><p className="journey-kicker">REAL-WORLD OPPORTUNITY DISCOVERY · INDIA</p><h2>Find work that fits your next step</h2><p>Search live listings on Google and established opportunity platforms using <b>{goal}</b> and your focus skills: <b>{careerPlan.focus.slice(0,2).join(', ')}</b>.</p><label className="opportunity-keyword">Add a skill or keyword<input value={opportunityKeyword} onChange={e=>setOpportunityKeyword(e.target.value.slice(0,80))} placeholder="e.g. Bengaluru, fintech, React"/></label></div><img src="/opportunity-discovery-illustration.svg" alt="Illustration of a portfolio briefcase, location marker and verified opportunity"/></section>
  <div className="section-title"><h2>Choose what you’re looking for</h2><Pill tone="green">Searches update for {goal}</Pill></div>
  <div className="filter-row opportunity-filters">{['Internships','Entry-level jobs','Projects','Remote opportunities'].map(category=><button key={category} className={opportunityCategory===category?'filter active-filter':'filter'} onClick={()=>setOpportunityCategory(category)}>{category}</button>)}</div>
  <div className="opportunity-list external-opportunities">{opportunitySources.map(source=><article className="opportunity-card external-opportunity-card" key={source.name}><div className="opp-icon"><BriefcaseBusiness/></div><div className="opp-main"><h3>{source.name}</h3><p>{source.detail}</p><div className="match-reason">Search: {opportunityQuery}</div></div><a className="primary" href={source.href} target="_blank" rel="noopener noreferrer">View matching listings <ExternalLink size={15}/></a></article>)}</div>
  <p className="footnote">These links open live provider searches; BuildBridge does not scrape or copy third-party listings. Verify eligibility, deadlines and employer details on the source site. BuildBridge-published opportunities appear below.</p>
  {matchedOpportunities.length>0&&<>
   <div className="section-title"><h2>Recommended opportunities</h2><Pill tone="green">Matched to demonstrated work</Pill></div>
   <p className="muted">Matches use exact skill names in your demonstrated or company-verified evidence and the stated career goal. They do not guarantee eligibility or selection. Confirm all requirements with the publisher.</p>
   <div className="opportunity-list">{matchedOpportunities.map((o:any)=><article className="opportunity-card matched-opportunity" key={o.id}>
    <div className="opp-icon"><BriefcaseBusiness/></div>
    <div className="opp-main">
     <div className="tag-row"><Pill>{String(o.kind||'Opportunity').replace(/_/g,' ')}</Pill><Pill tone={o.matchScore>=.65?'green':o.matchScore>=.3?'blue':'orange'}>{o.matchLabel}</Pill></div>
     <h3>{o.title}</h3><p>{o.scope}</p><div className="match-reason">{o.matchReason}</div>
     {o.required_skills?.length>0&&<div className="opportunity-requirements"><b>Required skills:</b>{o.required_skills.map((skill:string)=><span className={o.matchedSkills.includes(skill)?'skill-chip matched':'skill-chip'} key={skill}>{skill}</span>)}</div>}
     <div className="opportunity-detail-meta"><span>Experience: {o.experience_level||'Not stated'}</span><span>Location: {o.is_remote?'Remote':o.location||'Not stated'}</span><span>Deadline: {o.deadline||'Not specified'}</span></div>
     {o.eligibility&&<>
      <small>Eligibility: {o.eligibilityStatus||'Review publisher requirements'}</small>
      <small>Stated eligibility: {o.eligibilityDetails?.length?o.eligibilityDetails.join(' · '):'No structured education, year, CGPA or location limits supplied.'}</small>
      <small>Additional requirements: {o.eligibility}</small>
     </>}
     <small>Deliverables: {o.deliverables||'Not specified'} · Review criteria: {o.acceptance_criteria||'Not stated'}</small>
    </div>
    <div className="opp-side"><b>{o.payment_terms||'Compensation not stated'}</b><small>{o.payment_terms?'Publisher-stated terms':'Publisher did not state compensation'}</small>{o.application?<Pill tone={o.application.status==='accepted'?'green':o.application.status==='rejected'?'orange':'blue'}>Application: {o.application.status.replace(/_/g,' ')}</Pill>:null}<button className="primary" disabled={busy||applications.includes(o.id)||Boolean(o.application)} onClick={()=>applyOpportunity(o.id)}>{o.application?'Application submitted':applications.includes(o.id)?'Applied':'Apply'}</button></div>
   </article>)}</div>
  </>}
 </>}
 {role==='student'&&screen==='Projects'&&<><StudentProjectCatalogue careerGoal={goal} onSelectProject={setSelectedProjectId}/><div className="mentor-card wide"><Sparkles/><h3>AI Mentor</h3><p>Ask questions about your current project, request progressive hints or review your approach.</p><textarea value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ask a question about your project..."/><button className="primary" disabled={busy||!query.trim()} onClick={aiAsk}>{busy?'Thinking…':'Ask AI Mentor'}</button>{busy&&<p className="mentor-typing" role="status">Thinking through your question…</p>}{aiMentorError&&<div className="mentor-error" role="alert"><p>{aiMentorError}</p><button className="outline" disabled={busy||!lastAiPrompt} onClick={()=>void aiAsk(lastAiPrompt)}>Retry</button></div>} {aiResponse&&<div className="ai-response" aria-live="polite"><SafeMarkdown>{aiResponse}</SafeMarkdown></div>}<small>AI feedback is advisory. It does not approve industry deliverables.</small></div></>}
 {role==='student'&&screen==='My Projects'&&<StudentMyProjects/>}
 {role==='student'&&screen==='My Learning & Work Vault'&&<StudentVault/>}
 {role==='student'&&screen==='AI Mentor'&&<div className="mentor-card wide"><div className="mentor-page-heading"><div><Sparkles/><h2>Your AI learning mentor</h2></div><div className="inline-actions"><button className="outline" disabled={busy} onClick={startNewMentorConversation}>New conversation</button><button className="text-btn" disabled={busy||!aiConversationId} onClick={()=>void clearMentorConversation()}>Clear current</button></div></div><p>Ask questions, request progressive hints, explain a concept or review your attempt. Your conversations are saved to your private account, and your learning context is used only when personalization is enabled.</p>{aiMentorError&&<div className="mentor-error" role="alert"><p>{aiMentorError}</p><button className="outline" disabled={busy||!lastAiPrompt} onClick={()=>void aiAsk(lastAiPrompt)}>Retry</button></div>}{aiMessages.length>0?<div className="mentor-history" aria-live="polite">{aiMessages.map((message:any)=><div className={'mentor-message '+(message.role==='assistant'?'mentor-reply':'mentor-question')} key={message.id||`${message.role}-${message.created_at||message.content}`}><b>{message.role==='assistant'?'Mentor':'You'}</b><p>{message.content}</p></div>)}</div>:<div className="mentor-empty-history"><Sparkles size={20}/><b>Start a fresh mentoring session</b><span>Your previous conversations are kept separate from this one.</span></div>}<textarea value={query} onChange={e=>setQuery(e.target.value)} placeholder="What are you working on?"/>{busy&&<p className="mentor-typing" role="status">Thinking through your question…</p>}<button className="primary" disabled={busy||!query.trim()} onClick={()=>void aiAsk()}>{busy?'Thinking…':'Ask mentor'}</button></div>}
 {role==='student'&&screen==='My Path'&&<><CourseworkMapper careerGoal={goal} onExploreProjects={()=>setScreen('Projects')}/><div className="panel roadmap-panel"><div className="section-title"><h2>{goal} roadmap</h2><button className="primary" disabled={roadmapLoading} onClick={generateCareerRoadmap}>{roadmapLoading?'Generating…':'Generate personalized roadmap'}</button></div><p className="muted">{roadmapPlan?.career_goal===goal?'AI-generated roadmap saved to your account.':'Curated starter roadmap. Generate an AI-personalized plan to save it to your account.'} Progress reflects completed learning records and verified skill evidence.</p>{roadmapError&&<div className="recommendation-error" role="status">{roadmapError}</div>}{roadmapSteps.map((step:any,index:number)=><article className="roadmap-row roadmap-detail" key={`${index}-${step.title}`}><span>{index+1}</span><div className="roadmap-step-copy"><b>{step.title}</b><p>{step.explanation}</p><small>Required skills: {step.requiredSkills.join(', ')||'Career-specific foundations'}</small><small>Recommended topics: {step.learningTopics.join(', ')||step.topic}</small><small>Completion criteria: {step.completionCriteria}</small>{step.relatedProject&&<small>Related active project: {step.relatedProject.title}</small>}</div><div className="roadmap-step-actions"><Pill tone={step.completed?'green':'blue'}>{step.completed?'Completed':'Recommended'}</Pill><button className="outline" onClick={()=>navigateLearningTopic(step.topic)}>Learn {step.topic}</button></div></article>)}</div></>}
 {role==='student'&&screen==='Achievements'&&<CertificateVault certificates={workspaceData?.certificates||[]}/>}
 {screen==='Settings'&&<div className="settings-grid">
  <div className="panel settings-panel"><h2>Settings</h2><h3>Appearance</h3><div className="theme-options"><button className={!dark?'chosen':''} onClick={()=>setDark(false)}><Sun/> Light</button><button className={dark?'chosen':''} onClick={()=>setDark(true)}><Moon/> Dark</button></div></div>
  {role==='student'&&<NotificationSettings/>}
  {role==='company_member'&&<><CompanyNotificationSettings/><div className="panel settings-panel"><h2>Account and security</h2><p className="muted">Manage your personal details, login email and password from the secure Profile page.</p><button className="outline" onClick={()=>setScreen('Profile')}>Open account profile</button></div></>}
  {role==='admin'&&<><AdminNotificationSettings/><div className="panel settings-panel"><h2>Email announcement</h2><p className="muted">Queue a platform-wide announcement through the configured Resend sender. Custom sender domains are not accepted.</p><label>Subject<input value={announcementSubject} maxLength={120} onChange={event=>setAnnouncementSubject(event.target.value)} placeholder="BuildBridge platform update"/></label><label>Message<textarea value={announcementBody} maxLength={5000} onChange={event=>setAnnouncementBody(event.target.value)} placeholder="Write the announcement..." /></label><button className="primary" disabled={busy} onClick={()=>void sendAnnouncement()}>{busy?'Queuing…':'Queue announcement'}</button></div><div className="panel settings-panel"><h2>Administrator account</h2><p className="muted">Manage account security and authentication from the Profile page. Platform health and audit controls remain in dedicated administrator screens.</p><div className="project-card-actions"><button className="outline" onClick={()=>setScreen('Profile')}>Open account profile</button><button className="outline" onClick={()=>setScreen('Platform Health')}>Open platform health</button></div></div></>}
 </div>}
 {role==='admin'&&screen==='Platform Health'&&<div className="panel settings-panel"><h2>Platform health</h2><p className="muted">Check server connectivity and configuration. Secret values are never exposed here.</p><button className="outline" disabled={busy} onClick={checkBackend}>{busy?'Checking…':'Run provider diagnostics'}</button>{backendHealth&&<div className="health-result"><div><b>Supabase configuration</b><Pill tone={backendHealth.supabaseConfigured?'green':'orange'}>{backendHealth.supabaseConfigured?'Configured':'Missing'}</Pill></div><div><b>Supabase server connection</b><Pill tone={backendHealth.supabaseReachable?'green':'orange'}>{backendHealth.supabaseReachable?'Reachable':backendHealth.supabaseReachable===false?'Unavailable':'Not tested'}</Pill></div><div><b>Gemini</b><Pill tone={backendHealth.geminiReachable?'green':backendHealth.geminiConfigured?'orange':'orange'}>{backendHealth.geminiReachable?`Reachable (${backendHealth.geminiHttpStatus})`:backendHealth.geminiConfigured?'Authentication or network issue':'Missing'}</Pill></div><div><b>YouTube</b><Pill tone={backendHealth.youtubeReachable?'green':backendHealth.youtubeConfigured?'orange':'orange'}>{backendHealth.youtubeReachable?`Reachable (${backendHealth.youtubeHttpStatus})`:backendHealth.youtubeConfigured?'Authentication or network issue':'Missing'}</Pill></div><div><b>Resend</b><Pill tone={backendHealth.resendReachable?'green':backendHealth.resendConfigured?'orange':'orange'}>{backendHealth.resendReachable?`Reachable (${backendHealth.resendHttpStatus})`:backendHealth.resendConfigured?'Authentication or network issue':'Missing'}</Pill></div><div><b>Announcement sender</b><Pill tone={backendHealth.emailFromConfigured&&backendHealth.appBaseUrlConfigured?'green':'orange'}>{backendHealth.emailFromConfigured&&backendHealth.appBaseUrlConfigured?'Configured':'Missing'}</Pill></div><div><b>GitHub</b><Pill tone={backendHealth.githubReachable?'green':'orange'}>{backendHealth.githubReachable?(backendHealth.githubTokenConfigured?'Token reachable':'Anonymous reachable'):'Unavailable'}</Pill></div></div>}</div>}
 {role==='company_member'&&screen==='Dashboard'&&workspaceReady&&<><div className="metric-grid">{[[String(liveProjects.length),'Your projects'],[String(liveSubmissions.length),'Accessible submissions'],[String(liveSubmissions.filter((x:any)=>x.company_decision===null).length),'Awaiting review'],[String(liveSubmissions.filter((x:any)=>x.company_decision==='approved').length),'Approved submissions']].map(x=><div className="metric" key={x[1]}><b>{x[0]}</b><small>{x[1]}</small></div>)}</div><div className="panel"><div className="section-title"><h2>Your recent submissions</h2><button className="outline" onClick={()=>setScreen('Submissions')}>View all</button></div>{liveSubmissions.length===0?<div className="empty-state"><FolderKanban size={36}/><h3>No submissions yet</h3><p>Student evidence for your assigned projects will appear here.</p></div>:<div className="submission-list">{liveSubmissions.slice(0,8).map((submission:any)=><div className="roadmap-row" key={submission.id}><div><b>Student {String(submission.student_user_id).slice(0,8)} · {getProjectName(submission.project_id)} · {getMilestoneName(submission)}</b><small>{submission.status} · {new Date(submission.created_at).toLocaleString()}</small></div><button className="outline" disabled={Boolean(submission.company_decision)} onClick={()=>void openSubmissionReview(submission)}>{submission.company_decision==='approved'?'Approved':submission.company_decision==='revision_requested'?'Revision requested':'Review'}</button></div>)}</div>}</div></>}
 {role==='company_member'&&screen==='Create Project'&&<ProjectManagement mode="company" verified={!!workspaceData?.company?.verified} onRefresh={()=>void refreshWorkspace()}/>}
 {role==='company_member'&&screen==='Submissions'&&<div className="panel"><h2>Evidence review queue</h2><p className="muted">AI evaluation is advisory. Only the assigning verified company can record the final approval.</p>{liveSubmissions.length===0?<div className="empty-state"><FolderKanban size={36}/><h3>No evidence awaiting review</h3><p>Submissions to your projects will appear here once students upload their work.</p></div>:liveSubmissions.map((submission:any)=><div className="roadmap-row" key={submission.id}><div><b>Student {String(submission.student_user_id).slice(0,8)} · {getProjectName(submission.project_id)} · {getMilestoneName(submission)}</b><small>{submission.status} · Submitted {new Date(submission.created_at).toLocaleString()}</small></div><button className="outline" disabled={Boolean(submission.company_decision)} onClick={()=>void openSubmissionReview(submission)}>{submission.company_decision==='approved'?'Approved':submission.company_decision==='revision_requested'?'Revision requested':'Review evidence'}</button></div>)}</div>}
 {role==='company_member'&&screen==='Company Profile'&&<><div className="panel form-panel"><div className="section-title"><h2>Organization profile</h2><Pill tone={workspaceData?.company?.verified?'green':'orange'}>{workspaceData?.company?.verified?'Verified organization':'Verification required'}</Pill></div><p className="muted">Review or update organization verification through the existing secure verification workflow. Project publishing remains locked until administrator approval.</p></div><CompanyDomainRequest/><CompanyCertificateAuthorization verified={Boolean(workspaceData?.company?.verified)} signatory={workspaceData?.certificateSignatory||null} onSaved={()=>void refreshWorkspace()}/></>}
 {role==='admin'&&screen==='Dashboard'&&workspaceReady&&<><div className="metric-grid">{[[String(liveUsers.filter((x:any)=>x.role==='student').length),'Student accounts'],[String(liveCompanies.length),'Company records'],[String(liveProjects.length),'Projects'],[String(liveSubmissions.length),'Submissions']].map(x=><div className="metric" key={x[1]}><b>{x[0]}</b><small>{x[1]}</small></div>)}</div><div className="panel"><div className="section-title"><h2>Company verification queue</h2><button className="outline" onClick={refreshWorkspace}>Refresh</button></div>{liveCompanies.filter((company:any)=>company.verification_status!=='verified'&&company.verified!==true).length===0?<div className="empty-state"><ShieldCheck size={36}/><h3>No companies awaiting verification</h3><p>New organization requests will appear here.</p></div>:liveCompanies.filter((company:any)=>company.verification_status!=='verified'&&company.verified!==true).map((company:any)=><div className="roadmap-row" key={company.id}><div><b>{company.name}</b><small>{company.verification_status||'pending'} · {new Date(company.created_at).toLocaleDateString()}</small></div><Pill tone="orange">Pending review</Pill></div>)}</div></>}
 {role==='admin'&&screen==='Project Moderation'&&<ProjectManagement mode="admin" onRefresh={()=>void refreshWorkspace()}/>}
 {role==='admin'&&screen==='Certificates'&&<CertificateAdministration students={liveUsers} projects={liveProjects} certificates={workspaceData?.certificates||[]} onRefresh={()=>void refreshWorkspace()}/>}
 {role==='admin'&&screen==='Company Verification'&&<AdminCompanyDomainRequests/>}
 {role==='admin'&&screen==='Users & Access'&&<section className="panel admin-users-panel"><div className="section-title"><div><h2>Users &amp; Access</h2><p className="muted">Account roles and controlled company verification actions.</p></div><Pill tone="blue">{liveUsers.length} accounts</Pill></div>{liveUsers.length?<div className="admin-user-table">{liveUsers.map((user:any)=>{
  const company=liveCompanies.find((item:any)=>item.owner_user_id===user.id);
  const companyRequest=liveCompanyRequests.find((item:any)=>item.user_id===user.id);
  return <article className="admin-user-row" key={user.id}><div className="admin-user-copy"><b>{user.full_name||'Name unavailable'}</b><span title={user.email}>{user.email}</span><small>{user.id}</small>{companyRequest&&<small>Verification: {companyRequest.status} · {companyRequest.organization_name||'Details pending'}</small>}</div><Pill tone={user.role==='admin'?'purple':user.role==='company_member'?'green':'blue'}>{user.role}</Pill>{companyRequest&&<button className="outline" onClick={()=>setScreen('Company Verification')}>Review verification</button>}{user.role==='company_member'&&!company&&!companyRequest&&<small>No organization record or request</small>}</article>;
 })}</div>:<p className="muted">No user records were returned.</p>}</section>}
 {role==='admin'&&screen==='AI Management'&&<section className="panel ai-management-panel"><div className="section-title"><div><h2>AI Control Center</h2><p className="muted">Actual recorded Gemini request outcomes. Private prompts and API keys are never displayed.</p></div><button className="outline" disabled={busy} onClick={checkBackend}>{busy?'Checking…':'Run provider status check'}</button> </div><div className="health-result"><div><b>Gemini API key</b><Pill tone={backendHealth?.geminiConfigured?'green':'orange'}>{backendHealth ? (backendHealth.geminiConfigured?'Configured':'Missing'):'Not checked'}</Pill></div><div><b>YouTube API key</b><Pill tone={backendHealth?.youtubeConfigured?'green':'orange'}>{backendHealth ? (backendHealth.youtubeConfigured?'Configured':'Missing'):'Not checked'}</Pill></div></div>{(workspaceData?.aiUsage||[]).length?<div className="ai-usage-list">{
  (workspaceData?.aiUsage||[]).map((item:any)=><article className="roadmap-row" key={item.id}><div><b>{item.feature} · {item.model||'Model unavailable'}</b><small>{new Date(item.created_at).toLocaleString()} · {item.duration_ms||0} ms · {item.success?'Success':'Failure'}{item.failure_category?` · ${item.failure_category}`:''}</small></div><Pill tone={item.success?'green':'orange'}>{item.status}</Pill></article>)
 }</div>:<div className="empty-state"><Bot size={36}/><h3>No AI activity recorded yet</h3><p>Real mentor or provider requests will appear here after the migration is applied and activity is generated.</p></div>}</section>}
 {role==='admin'&&screen==='Audit Trail'&&<section className="panel audit-trail-panel"><div className="section-title"><h2>Audit Trail</h2><Pill tone="blue">{workspaceData?.auditLogs?.length||0} recent events</Pill></div>{workspaceData?.auditLogs?.length?workspaceData.auditLogs.map((log:any)=><article className="roadmap-row" key={log.id}><div><b>{log.action}</b><small>{log.entity_type||'Platform event'} · {log.details?.outcome||'outcome unavailable'} · {new Date(log.created_at).toLocaleString()}</small></div></article>):<div className="empty-state"><ShieldCheck size={36}/><h3>No audit events recorded yet</h3><p>Real administrative and platform actions will appear here.</p></div>}</section>}
 {role==='student'&&screen!=='AI Mentor'&&<div className={'global-mentor '+(mentorAlign==='right'?'align-right ':'')+(mentorDragging?'dragging':'')} style={mentorPosition?{left:mentorPosition.x,top:mentorPosition.y,right:'auto',bottom:'auto'}:undefined}>
  {mentorOpen&&<section ref={mentorPanelRef} className={'global-mentor-panel '+(mentorPlacement==='below'?'below':'')} aria-label="AI Mentor chat">
   <header><div><b><Sparkles size={16}/> BuildBridge Mentor</b><small>Context: {screen}</small></div><button className="icon-btn" aria-label="Close AI Mentor" onClick={()=>setMentorOpen(false)}><X size={17}/></button></header>
   <div className="global-mentor-messages">{aiMessages.slice(-6).map((message:any)=><article className={message.role==='assistant'?'mentor-reply':'mentor-question'} key={message.id||`${message.role}-${message.created_at||message.content}`}><b>{message.role==='assistant'?'Mentor':'You'}</b><p>{message.content}</p></article>)}{busy&&<p className="mentor-typing" role="status">Thinking through your question…</p>}{aiMentorError&&<div className="mentor-error" role="alert"><p>{aiMentorError}</p><button className="outline" disabled={busy||!lastAiPrompt} onClick={()=>void aiAsk(lastAiPrompt)}>Retry</button></div>}</div>
   <textarea aria-label="Ask the AI Mentor" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void aiAsk();}}} placeholder="What are you working on?"/>
   <div className="mentor-quick-actions"><button onClick={()=>void aiAsk(`Give me one hint about this page: ${query.trim()||'help me choose a useful next step'}`)}>Hint</button><button onClick={()=>void aiAsk(`Explain the key concept I should understand here: ${query.trim()||screen}`)}>Explain</button><button onClick={()=>void aiAsk(`Check my approach and ask what I have tried: ${query.trim()||'I am planning my next step'}`)}>Check my approach</button><button onClick={()=>void aiAsk(`Help me debug this step by step: ${query.trim()||'I will describe the issue next'}`)}>Debug</button></div>
   <button className="primary full" disabled={busy||!query.trim()} onClick={()=>void aiAsk()}>{busy?'Thinking…':'Ask mentor'}</button>
  </section>}
  <button ref={mentorLauncherRef} className="global-mentor-launcher" aria-label="Drag to move the AI Mentor or activate to open it" title="Drag to move · click to open" aria-expanded={mentorOpen} onPointerDown={startMentorDrag} onPointerMove={moveMentorDrag} onPointerUp={endMentorDrag} onPointerCancel={endMentorDrag} onClick={toggleMentor}><Sparkles size={18}/>{mentorOpen?'Close mentor':'Ask AI Mentor'}</button>
 </div>}
 {notice&&<div className="toast"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>}
 </div></section>
 {learningCompletionModal&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="What would you like to do next?" onClick={()=>setLearningCompletionModal(false)}><div className="modal" onClick={event=>event.stopPropagation()}><button type="button" className="modal-close" onClick={()=>setLearningCompletionModal(false)}><X/></button><h2>Video completed</h2><p className="muted">Choose a practical next step. This learning activity is recorded separately from skill mastery.</p><div className="modal-actions"><button type="button" className="primary" onClick={()=>{setLearningCompletionModal(false);setScreen('Projects')}}>Build a practice project</button><button type="button" className="outline" onClick={()=>{setLearningCompletionModal(false);setScreen('Projects')}}>Explore open-source work</button><button type="button" className="outline" onClick={()=>{setLearningCompletionModal(false);setScreen('Opportunities')}}>Explore opportunities</button><button type="button" className="text-btn" onClick={()=>setLearningCompletionModal(false)}>Continue learning</button></div></div></div>}
 {modal&&<div className="modal-backdrop" onClick={()=>setModal('')}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal('')}><X/></button>{modal==='goal'?<><h2>Choose your career target</h2><p className="muted">Your target helps BuildBridge personalize your roadmap.</p><select value={goalDraft} onChange={e=>setGoalDraft(e.target.value)}>{Object.keys(careerPlans).map(careerGoal=><option key={careerGoal}>{careerGoal}</option>)}</select><button className="primary full" disabled={busy} onClick={updateCareerGoal}>{busy?'Saving…':'Save career goal'}</button></>:modal==='review'?<><h2>Company evidence review</h2><p>Review submitted evidence against the project and milestone criteria. Only the verified assigning company can record a decision.</p><div className="review-note">AI evaluation is advisory. Your decision is recorded against this submission.</div>{selectedSubmission&&<p><b>Project:</b> {getProjectName(selectedSubmission.project_id)} · <b>Milestone:</b> {getMilestoneName(selectedSubmission)}</p>}{selectedSubmission?.evidence?.fileName&&<p><b>Evidence:</b> {selectedSubmission.evidence.fileName}</p>}{selectedSubmission?.evidenceUrl?<a className="outline" href={selectedSubmission.evidenceUrl} target="_blank" rel="noopener noreferrer">Open submitted evidence</a>:<p className="muted" role="status">{reviewEvidenceError}</p>}{selectedSubmission?.reflection&&<div className="submission-status"><b>Student reflection</b><p>{selectedSubmission.reflection}</p></div>}<textarea value={reviewFeedback} onChange={e=>setReviewFeedback(e.target.value)} placeholder="Feedback or required revisions..."/><div className="modal-actions"><button className="outline" disabled={busy||Boolean(selectedSubmission?.company_decision)} onClick={()=>reviewSubmission('revision_requested')}>Request revision</button><button className="primary" disabled={busy||Boolean(selectedSubmission?.company_decision)} onClick={()=>reviewSubmission('approved')}>Approve deliverable</button></div></>:<><h2>Create project</h2><p>Define the scope and acceptance terms in the company workspace.</p><button className="primary" onClick={()=>{setModal('');setScreen('Create Project')}}>Continue</button></>}</div></div>}
 </main>
}
