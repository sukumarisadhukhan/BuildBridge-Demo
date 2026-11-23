create extension if not exists pgcrypto;
do $$ begin create type public.app_role as enum ('student','company_member','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.project_status as enum ('draft','published','in_progress','under_review','revision_requested','approved','completed'); exception when duplicate_object then null; end $$;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text,full_name text,role public.app_role not null default 'student',career_goal text,created_at timestamptz not null default now());
create table if not exists public.platform_admin_owner(singleton boolean primary key default true check(singleton),owner_user_id uuid not null unique references public.profiles(id),owner_email text not null,updated_at timestamptz not null default now());
alter table public.platform_admin_owner enable row level security;
revoke all on public.platform_admin_owner from public,anon,authenticated;
grant all on public.platform_admin_owner to service_role;
alter table public.profiles add column if not exists career_goal text;
create unique index if not exists one_platform_admin on public.profiles(role) where role='admin';
create table if not exists public.companies(id uuid primary key default gen_random_uuid(),owner_user_id uuid not null references public.profiles(id),name text not null,verified boolean not null default false,verification_status text not null default 'pending',created_at timestamptz not null default now());
create table if not exists public.projects(id uuid primary key default gen_random_uuid(),company_id uuid references public.companies(id),company_user_id uuid not null references public.profiles(id),title text not null,scope text not null default '',deliverables text,acceptance_criteria text,deadline date,revision_policy text,payment_terms text,status public.project_status not null default 'draft',is_industry boolean not null default true,created_at timestamptz not null default now());
create table if not exists public.submissions(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),student_user_id uuid not null references public.profiles(id),evidence jsonb not null default '{}'::jsonb,reflection text,status text not null default 'submitted',ai_score numeric,ai_feedback jsonb,company_decision text,company_feedback text,reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.opportunities(id uuid primary key default gen_random_uuid(),company_id uuid references public.companies(id),created_by uuid not null references public.profiles(id),title text not null,kind text not null,scope text not null,deliverables text not null,acceptance_criteria text not null,deadline date,revision_policy text,payment_terms text,eligibility jsonb not null default '{}'::jsonb,status text not null default 'draft',created_at timestamptz not null default now());
create table if not exists public.applications(id uuid primary key default gen_random_uuid(),opportunity_id uuid not null references public.opportunities(id),student_user_id uuid not null references public.profiles(id),status text not null default 'applied',created_at timestamptz not null default now(),unique(opportunity_id,student_user_id));
create table if not exists public.skill_evidence(id uuid primary key default gen_random_uuid(),student_user_id uuid not null references public.profiles(id),skill text not null,status text not null check(status in ('studied','practiced','demonstrated','company_verified')),source_type text,source_id uuid,created_at timestamptz not null default now());
create table if not exists public.certificates(id uuid primary key default gen_random_uuid(),student_user_id uuid not null references public.profiles(id),project_id uuid not null references public.projects(id),submission_id uuid not null references public.submissions(id),certificate_type text not null default 'industry_completion',issued_at timestamptz not null default now(),unique(submission_id));
create table if not exists public.audit_logs(id uuid primary key default gen_random_uuid(),actor_user_id uuid references public.profiles(id),action text not null,entity_type text,entity_id uuid,details jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$ begin insert into public.profiles(id,email,full_name,role) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),'student'::public.app_role) on conflict(id) do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users; create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- RLS helper functions run as the schema owner, avoiding recursive self-lookups
-- when policies on public.profiles need to check an account role.
create or replace function public.current_user_role()
returns public.app_role
language sql stable security definer
set search_path = public, pg_temp
as $$ select p.role from public.profiles p where p.id = auth.uid() limit 1 $$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
	select exists (
		select 1
		from public.profiles p
		join public.platform_admin_owner owner
			on owner.owner_user_id = p.id
			and lower(owner.owner_email) = lower(p.email)
		where p.id = auth.uid()
			and p.role = 'admin'::public.app_role
			and lower(coalesce(auth.jwt()->>'email', '')) = lower(p.email)
	)
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
create or replace function public.ensure_my_profile() returns public.profiles language plpgsql security definer set search_path=public,auth,pg_temp as $$ declare auth_user auth.users; result_profile public.profiles; begin select * into auth_user from auth.users where id=auth.uid(); if auth_user.id is null then raise exception 'No authenticated user was found.'; end if; insert into public.profiles(id,email,full_name,role) values(auth_user.id,auth_user.email,coalesce(auth_user.raw_user_meta_data->>'full_name',auth_user.raw_user_meta_data->>'name'),'student'::public.app_role) on conflict(id) do update set email=excluded.email,full_name=coalesce(public.profiles.full_name,excluded.full_name) returning * into result_profile; return result_profile; end $$;
revoke all on function public.ensure_my_profile() from public,anon; grant execute on function public.ensure_my_profile() to authenticated;
create or replace function public.request_company_role() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin raise exception 'Company role access requires verified domain ownership and administrator approval.'; end $$;
revoke all on function public.request_company_role() from public,anon,authenticated;
create or replace function public.issue_industry_certificate() returns trigger language plpgsql security definer set search_path=public as $$ declare p public.projects; begin if new.company_decision='approved' and old.company_decision is distinct from 'approved' then select * into p from public.projects where id=new.project_id; if p.is_industry and p.company_user_id=new.reviewed_by and exists(select 1 from public.companies c where c.owner_user_id=p.company_user_id and c.verified=true) then insert into public.certificates(student_user_id,project_id,submission_id) values(new.student_user_id,new.project_id,new.id) on conflict(submission_id) do nothing; update public.projects set status='completed' where id=p.id; end if; end if; return new; end $$;
drop trigger if exists certificate_after_company_approval on public.submissions; create trigger certificate_after_company_approval after update of company_decision on public.submissions for each row execute function public.issue_industry_certificate();
-- RLS: no public role escalation; admin is manually provisioned by project owner.
alter table public.profiles enable row level security; alter table public.companies enable row level security; alter table public.projects enable row level security; alter table public.submissions enable row level security; alter table public.opportunities enable row level security; alter table public.applications enable row level security; alter table public.skill_evidence enable row level security; alter table public.certificates enable row level security; alter table public.audit_logs enable row level security;
create policy "profiles read self or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_platform_admin());
create policy "profiles update self limited" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role=public.current_user_role());
create policy "companies owner read" on public.companies for select to authenticated using(owner_user_id=auth.uid() or verified=true or public.is_platform_admin());
create policy "company create own" on public.companies for insert to authenticated with check(owner_user_id=auth.uid() and public.current_user_role()='company_member'::public.app_role);
create policy "company owner update" on public.companies for update to authenticated using(owner_user_id=auth.uid() or public.is_platform_admin()) with check(owner_user_id=auth.uid() or public.is_platform_admin());
create policy "projects visible" on public.projects for select to authenticated using(status='published' or company_user_id=auth.uid() or public.is_platform_admin());
create policy "company creates projects" on public.projects for insert to authenticated with check(company_user_id=auth.uid() and exists(select 1 from public.companies c where c.owner_user_id=auth.uid() and c.verified=true));
create policy "assigning company updates projects" on public.projects for update to authenticated using(company_user_id=auth.uid() or public.is_platform_admin()) with check(company_user_id=auth.uid() or public.is_platform_admin());
create policy "submission student or assigning company reads" on public.submissions for select to authenticated using(student_user_id=auth.uid() or exists(select 1 from public.projects p where p.id=project_id and p.company_user_id=auth.uid()) or public.is_platform_admin());
create policy "student submits own evidence" on public.submissions for insert to authenticated with check(student_user_id=auth.uid() and public.current_user_role()='student'::public.app_role);
create policy "assigning company reviews" on public.submissions for update to authenticated using(exists(select 1 from public.projects p join public.companies c on c.owner_user_id=p.company_user_id and c.verified=true where p.id=project_id and p.company_user_id=auth.uid())) with check(exists(select 1 from public.projects p where p.id=project_id and p.company_user_id=auth.uid()) and reviewed_by=auth.uid());
create policy "opportunities visible" on public.opportunities for select to authenticated using(status='published' or created_by=auth.uid() or public.is_platform_admin());
create policy "verified companies publish opportunities" on public.opportunities for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.companies c where c.owner_user_id=auth.uid() and c.verified=true));
create policy "students manage own applications" on public.applications for all to authenticated using(student_user_id=auth.uid()) with check(student_user_id=auth.uid());
create policy "skills visible to owner and admin" on public.skill_evidence for select to authenticated using(student_user_id=auth.uid() or public.is_platform_admin());
create policy "certificates visible to owner and admin" on public.certificates for select to authenticated using(student_user_id=auth.uid() or public.is_platform_admin());
create policy "admin audit read" on public.audit_logs for select to authenticated using(public.is_platform_admin());

-- Company owners may edit the display name but cannot self-approve a company.
revoke insert, update on public.companies from authenticated;
grant insert (owner_user_id, name), update (name) on public.companies to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('project-evidence','project-evidence',false,10485760) on conflict(id) do nothing;
create policy "evidence upload own folder" on storage.objects for insert to authenticated with check(bucket_id='project-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "evidence read own or admin" on storage.objects for select to authenticated using(bucket_id='project-evidence' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_platform_admin()));

-- Explicit API-role grants (RLS remains the authorization boundary).
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.companies,public.projects,public.submissions,public.opportunities,public.applications,public.skill_evidence,public.certificates,public.audit_logs to authenticated;
grant usage,select on all sequences in schema public to authenticated;
create unique index if not exists companies_one_per_owner on public.companies(owner_user_id);
