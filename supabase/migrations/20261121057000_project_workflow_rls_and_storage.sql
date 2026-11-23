begin;

do $$
begin
  if to_regclass('public.project_assignments') is null
    or to_regclass('public.project_assignment_milestones') is null
    or to_regclass('public.project_milestone_progress') is null
    or to_regclass('public.submissions') is null
    or to_regclass('public.project_milestones') is null
  then
    raise exception 'The project workflow tables must exist before applying 20261121057000.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_milestones'
      and column_name = 'project_id'
  ) then
    raise exception 'project_milestones.project_id is missing. Resolve the live milestone schema before applying this migration.';
  end if;
  if to_regprocedure('public.is_platform_admin()') is null
    or to_regprocedure('public.current_user_role()') is null
  then
    raise exception 'Apply auth-setup-repair.sql and the platform identity migration before 20261121057000.';
  end if;
end;
$$;

-- Assignment visibility and student-only assignment creation.
alter table public.project_assignments enable row level security;

drop policy if exists "student reads own assignments" on public.project_assignments;
create policy "student reads own assignments"
  on public.project_assignments for select to authenticated
  using (student_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "assigning company reads assignments" on public.project_assignments;
create policy "assigning company reads assignments"
  on public.project_assignments for select to authenticated
  using (
    company_user_id = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = company_id
        and c.owner_user_id = auth.uid()
        and c.verified = true
    )
  );

drop policy if exists "student starts own assignment" on public.project_assignments;
create policy "student starts own assignment"
  on public.project_assignments for insert to authenticated
  with check (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
  );

revoke all on public.project_assignments from anon, authenticated;
grant select on public.project_assignments to authenticated;
grant insert (project_id, student_user_id) on public.project_assignments to authenticated;

-- Milestone progress remains read-only for API roles; triggers maintain it.
alter table public.project_milestone_progress enable row level security;

drop policy if exists "assignment progress participants read" on public.project_milestone_progress;
create policy "assignment progress participants read"
  on public.project_milestone_progress for select to authenticated
  using (
    student_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.project_assignments a
      where a.id = assignment_id
        and a.company_user_id = auth.uid()
        and exists (
          select 1 from public.companies c
          where c.id = a.company_id
            and c.owner_user_id = auth.uid()
            and c.verified = true
        )
    )
  );

revoke all on public.project_milestone_progress from anon, authenticated;
grant select on public.project_milestone_progress to authenticated;

-- Submission ownership and company-review boundaries.
alter table public.submissions enable row level security;

drop policy if exists "student reads own submissions" on public.submissions;
create policy "student reads own submissions"
  on public.submissions for select to authenticated
  using (student_user_id = auth.uid() or public.is_platform_admin());

drop policy if exists "assigning company reads submissions" on public.submissions;
create policy "assigning company reads submissions"
  on public.submissions for select to authenticated
  using (
    exists (
      select 1
      from public.project_assignments a
      join public.companies c
        on c.id = a.company_id
        and c.owner_user_id = auth.uid()
        and c.verified = true
      where a.id = assignment_id
        and a.project_id = project_id
        and a.student_user_id = student_user_id
        and a.company_user_id = auth.uid()
    )
  );

drop policy if exists "student inserts own workflow submission" on public.submissions;
create policy "student inserts own workflow submission"
  on public.submissions for insert to authenticated
  with check (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
  );

drop policy if exists "assigning company reviews submissions" on public.submissions;
create policy "assigning company reviews submissions"
  on public.submissions for update to authenticated
  using (
    exists (
      select 1
      from public.project_assignments a
      where a.id = assignment_id
        and a.project_id = project_id
        and a.student_user_id = student_user_id
        and a.company_user_id = auth.uid()
        and exists (
          select 1 from public.companies c
          where c.id = a.company_id
            and c.owner_user_id = auth.uid()
            and c.verified = true
        )
    )
  )
  with check (
    reviewed_by = auth.uid()
    and company_decision in ('approved', 'revision_requested')
  );

revoke all on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;
grant insert (
  project_id, student_user_id, assignment_id, milestone_id,
  evidence, reflection, status
) on public.submissions to authenticated;
grant update (
  company_decision, company_feedback, reviewed_by, reviewed_at, status
) on public.submissions to authenticated;

-- Private evidence Storage: upload/read/remove under the participant rules.
insert into storage.buckets(id, name, public, file_size_limit)
values ('project-evidence', 'project-evidence', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "evidence upload for own assignment" on storage.objects;
create policy "evidence upload for own assignment"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.project_assignments a
      where a.student_user_id = auth.uid()
        and a.project_id::text = (storage.foldername(name))[2]
        and a.status in ('active', 'submitted', 'revision_requested')
    )
  );

drop policy if exists "evidence readable by participants" on storage.objects;
create policy "evidence readable by participants"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
      or exists (
        select 1
        from public.project_assignments a
        join public.companies c
          on c.id = a.company_id
          and c.owner_user_id = auth.uid()
          and c.verified = true
        where a.student_user_id::text = (storage.foldername(name))[1]
          and a.project_id::text = (storage.foldername(name))[2]
          and a.company_user_id = auth.uid()
      )
    )
  );

drop policy if exists "remove unused evidence upload" on storage.objects;
create policy "remove unused evidence upload"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1
      from public.submissions s
      where s.student_user_id = auth.uid()
        and s.evidence->>'storagePath' = name
    )
  );

notify pgrst, 'reload schema';

commit;
