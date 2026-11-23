-- BuildBridge Auth + RLS repair.
-- Run this after database-schema.sql in Supabase SQL Editor.
-- Idempotent: replaces the profile trigger, helper RPCs and named RLS policies.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists career_goal text;
create unique index if not exists one_platform_admin on public.profiles(role) where role = 'admin';
create unique index if not exists companies_one_per_owner on public.companies(owner_user_id);

create table if not exists public.platform_admin_owner (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null unique references public.profiles(id),
  owner_email text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_admin_owner enable row level security;
revoke all on public.platform_admin_owner from public, anon, authenticated;
grant all on public.platform_admin_owner to service_role;

-- Public auth metadata never grants company or admin access.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  insert into public.profiles(id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'student'::public.app_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Safe bootstrap for accounts that were created before the trigger existed.
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  auth_user auth.users;
  result_profile public.profiles;
begin
  select * into auth_user from auth.users where id = auth.uid();
  if auth_user.id is null then
    raise exception 'No authenticated user was found.';
  end if;
  insert into public.profiles(id, email, full_name, role)
  values (
    auth_user.id,
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name'),
    'student'::public.app_role
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name)
  returning * into result_profile;
  return result_profile;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- SECURITY DEFINER helpers avoid a profiles -> profiles RLS recursion loop.
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

-- Company access is granted only after DNS proof and administrator approval.
create or replace function public.request_company_role()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Company role access requires administrator approval of a verified company domain.';
end;
$$;
revoke all on function public.request_company_role() from public, anon;
grant execute on function public.request_company_role() to authenticated;

-- Ensure API roles can reach tables; RLS below continues to govern each row.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.companies, public.projects, public.submissions,
  public.opportunities, public.applications, public.skill_evidence,
  public.certificates, public.audit_logs
  to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Company owners may edit the display name but cannot self-approve their
-- company through direct PostgREST writes.
revoke insert, update on public.companies from authenticated;
grant insert (owner_user_id, name), update (name) on public.companies to authenticated;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.projects enable row level security;
alter table public.submissions enable row level security;
alter table public.opportunities enable row level security;
alter table public.applications enable row level security;
alter table public.skill_evidence enable row level security;
alter table public.certificates enable row level security;
alter table public.audit_logs enable row level security;

-- Replace all application policies so older installations receive the same
-- authorization rules as a fresh install.
drop policy if exists "profiles read self or admin" on public.profiles;
drop policy if exists "profiles update self limited" on public.profiles;
create policy "profiles read self or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());
create policy "profiles update self limited" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check ((id = auth.uid() and role = public.current_user_role()) or public.is_platform_admin());

drop policy if exists "companies owner read" on public.companies;
drop policy if exists "company create own" on public.companies;
drop policy if exists "company owner update" on public.companies;
create policy "companies owner read" on public.companies for select to authenticated
  using (owner_user_id = auth.uid() or verified = true or public.is_platform_admin());
create policy "company create own" on public.companies for insert to authenticated
  with check (owner_user_id = auth.uid() and public.current_user_role() = 'company_member'::public.app_role);
create policy "company owner update" on public.companies for update to authenticated
  using (owner_user_id = auth.uid() or public.is_platform_admin())
  with check (owner_user_id = auth.uid() or public.is_platform_admin());

do $$
begin
  if to_regclass('public.project_assignments') is null then
    execute 'drop policy if exists "projects visible" on public.projects';
    execute 'drop policy if exists "company creates projects" on public.projects';
    execute 'drop policy if exists "assigning company updates projects" on public.projects';
    execute $policy$
      create policy "projects visible" on public.projects for select to authenticated
      using (status = 'published' or company_user_id = auth.uid() or public.is_platform_admin())
    $policy$;
    execute $policy$
      create policy "company creates projects" on public.projects for insert to authenticated
      with check (company_user_id = auth.uid() and exists (
        select 1 from public.companies c where c.owner_user_id = auth.uid() and c.verified = true
      ))
    $policy$;
    execute $policy$
      create policy "assigning company updates projects" on public.projects for update to authenticated
      using (company_user_id = auth.uid() or public.is_platform_admin())
      with check (company_user_id = auth.uid() or public.is_platform_admin())
    $policy$;

    execute 'drop policy if exists "submission student or assigning company reads" on public.submissions';
    execute 'drop policy if exists "student submits own evidence" on public.submissions';
    execute 'drop policy if exists "assigning company reviews" on public.submissions';
    execute $policy$
      create policy "submission student or assigning company reads" on public.submissions for select to authenticated
      using (student_user_id = auth.uid() or exists (
        select 1 from public.projects p where p.id = project_id and p.company_user_id = auth.uid()
      ) or public.is_platform_admin())
    $policy$;
    execute $policy$
      create policy "student submits own evidence" on public.submissions for insert to authenticated
      with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
    $policy$;
    execute $policy$
      create policy "assigning company reviews" on public.submissions for update to authenticated
      using (exists (
        select 1 from public.projects p join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
        where p.id = project_id and p.company_user_id = auth.uid()
      ))
      with check (exists (
        select 1 from public.projects p where p.id = project_id and p.company_user_id = auth.uid()
      ) and reviewed_by = auth.uid())
    $policy$;
  end if;
end;
$$;

drop policy if exists "opportunities visible" on public.opportunities;
drop policy if exists "verified companies publish opportunities" on public.opportunities;
create policy "opportunities visible" on public.opportunities for select to authenticated
  using (status = 'published' or created_by = auth.uid() or public.is_platform_admin());
create policy "verified companies publish opportunities" on public.opportunities for insert to authenticated
  with check (created_by = auth.uid() and exists (
    select 1 from public.companies c where c.owner_user_id = auth.uid() and c.verified = true
  ));

drop policy if exists "students manage own applications" on public.applications;
create policy "students manage own applications" on public.applications for all to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
  with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);

drop policy if exists "skills visible to owner and admin" on public.skill_evidence;
create policy "skills visible to owner and admin" on public.skill_evidence for select to authenticated
  using (student_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "certificates visible to owner and admin" on public.certificates;
create policy "certificates visible to owner and admin" on public.certificates for select to authenticated
  using (student_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "admin audit read" on public.audit_logs;
create policy "admin audit read" on public.audit_logs for select to authenticated
  using (public.is_platform_admin());

-- Private storage: each student can upload/read only their own UUID folder;
-- admins can inspect evidence for moderation.
insert into storage.buckets(id, name, public, file_size_limit)
values ('project-evidence', 'project-evidence', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;
do $$
begin
  if to_regclass('public.project_assignments') is null then
    execute 'drop policy if exists "evidence upload own folder" on storage.objects';
    execute 'drop policy if exists "evidence read own or admin" on storage.objects';
    execute $policy$
      create policy "evidence upload own folder" on storage.objects for insert to authenticated
      with check (bucket_id = 'project-evidence' and (storage.foldername(name))[1] = auth.uid()::text)
    $policy$;
    execute $policy$
      create policy "evidence read own or admin" on storage.objects for select to authenticated
      using (bucket_id = 'project-evidence' and (
        (storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin()
      ))
    $policy$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.project_assignments') is not null then
    execute 'revoke update on public.projects from authenticated';
    execute 'grant update (title, scope, deliverables, acceptance_criteria, deadline, revision_policy, payment_terms, status, category, difficulty, project_type, required_skills, estimated_duration_days, problem_statement, requirements, submission_format, resources, evaluation_rubric, updated_at) on public.projects to authenticated';
    execute 'revoke update on public.submissions from authenticated';
    execute 'grant update (company_decision, company_feedback, reviewed_by, reviewed_at, status) on public.submissions to authenticated';
  end if;
end;
$$;

-- Recreate a certificate only after a verified assigning company approves work.
do $$
begin
  if to_regclass('public.company_certificate_signatories') is null then
    execute $function$
      create or replace function public.issue_industry_certificate()
      returns trigger
      language plpgsql
      security definer
      set search_path = public, pg_temp
      as $body$
      declare
        project_row public.projects;
      begin
        if new.company_decision = 'approved' and old.company_decision is distinct from 'approved' then
          select * into project_row from public.projects where id = new.project_id;
          if project_row.is_industry
            and project_row.company_user_id = new.reviewed_by
            and exists (select 1 from public.companies c where c.owner_user_id = project_row.company_user_id and c.verified = true)
          then
            insert into public.certificates(student_user_id, project_id, submission_id)
            values (new.student_user_id, new.project_id, new.id)
            on conflict (submission_id) do nothing;
          end if;
        end if;
        return new;
      end;
      $body$;
    $function$;
    execute 'drop trigger if exists certificate_after_company_approval on public.submissions';
    execute 'create trigger certificate_after_company_approval after update of company_decision on public.submissions for each row execute function public.issue_industry_certificate()';
  end if;
end;
$$;
