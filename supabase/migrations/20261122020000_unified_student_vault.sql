begin;

create table if not exists public.student_vault_artifacts (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  artifact_type text not null
    check (artifact_type in ('learning_resource','study_note','project_evidence','report','external_link','submission','certificate','achievement')),
  title text not null,
  description text not null default '',
  external_url text,
  storage_path text,
  project_id uuid references public.projects(id) on delete set null,
  milestone_id uuid references public.project_milestones(id) on delete set null,
  evidence_id uuid references public.submissions(id) on delete set null,
  skill_names text[] not null default '{}'::text[],
  source_organization text,
  verification_status text not null default 'student_record'
    check (verification_status in ('student_record','demonstrated','company_verified','issued','revoked')),
  status text not null default 'active'
    check (status in ('active','completed','in_progress','archived','expired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vault_artifact_has_source
    check (external_url is not null or storage_path is not null or artifact_type in ('study_note','achievement','report'))
);

create index if not exists student_vault_artifacts_owner_created
  on public.student_vault_artifacts(student_user_id, created_at desc);
create index if not exists student_vault_artifacts_project
  on public.student_vault_artifacts(project_id);
create index if not exists student_vault_artifacts_skills
  on public.student_vault_artifacts using gin(skill_names);

alter table public.student_vault_artifacts enable row level security;

drop policy if exists "students manage own vault artifacts" on public.student_vault_artifacts;
create policy "students manage own vault artifacts"
  on public.student_vault_artifacts for all to authenticated
  using (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
  )
  with check (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
  );

revoke all on public.student_vault_artifacts from anon, authenticated;
grant select, insert, update, delete on public.student_vault_artifacts to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
values ('student-vault', 'student-vault', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "students upload own vault files" on storage.objects;
create policy "students upload own vault files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'student-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "students read own vault files" on storage.objects;
create policy "students read own vault files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'student-vault'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
    )
  );

drop policy if exists "students remove own vault files" on storage.objects;
create policy "students remove own vault files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'student-vault'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
