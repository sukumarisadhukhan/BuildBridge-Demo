-- BuildBridge project marketplace. Run after database-schema.sql and
-- supabase/auth-setup-repair.sql.

alter table public.projects alter column company_user_id drop not null;
alter table public.projects add column if not exists project_source text not null default 'company';
alter table public.projects add column if not exists slug text;
alter table public.projects add column if not exists category text not null default 'Other';
alter table public.projects add column if not exists difficulty text not null default 'Intermediate';
alter table public.projects add column if not exists project_type text not null default 'Capstone';
alter table public.projects add column if not exists required_skills text[] not null default '{}';
alter table public.projects add column if not exists estimated_duration_days integer;
alter table public.projects add column if not exists problem_statement text not null default '';
alter table public.projects add column if not exists requirements jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists submission_format text not null default '';
alter table public.projects add column if not exists resources jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists evaluation_rubric jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists publisher_label text;
alter table public.projects add column if not exists published_by uuid references public.profiles(id);
alter table public.projects add column if not exists updated_at timestamptz not null default now();

update public.projects
set project_source = case when is_industry then 'company' else 'legacy' end
where project_source = 'company' and not is_industry;

update public.projects p
set company_id = c.id
from public.companies c
where p.company_id is null and p.company_user_id = c.owner_user_id and p.is_industry;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_source_check') then
    alter table public.projects add constraint projects_source_check
      check (project_source in ('company', 'practice', 'legacy'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_difficulty_check') then
    alter table public.projects add constraint projects_difficulty_check
      check (difficulty in ('Beginner', 'Intermediate', 'Advanced'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_duration_check') then
    alter table public.projects add constraint projects_duration_check
      check (estimated_duration_days is null or estimated_duration_days between 1 and 365);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_source_consistency_check') then
    alter table public.projects add constraint projects_source_consistency_check
      check (
        (project_source = 'company' and is_industry)
        or (project_source in ('practice', 'legacy') and not is_industry)
      );
  end if;
end;
$$;

create unique index if not exists projects_slug_unique on public.projects(slug) where slug is not null;
create index if not exists projects_catalogue_idx on public.projects(status, project_source, category, difficulty);

create table if not exists public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  acceptance_criteria text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, sequence)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.project_milestones'::regclass
      and c.confrelid = 'public.projects'::regclass
      and c.contype = 'f'
      and c.conkey = array[(
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.project_milestones'::regclass
          and a.attname = 'project_id'
          and not a.attisdropped
      )]::smallint[]
  ) then
    alter table public.project_milestones
      add constraint project_milestones_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
end
$$;

insert into public.project_milestones(project_id, sequence, title, description, acceptance_criteria)
select
  p.id,
  1,
  'Plan and deliver the project',
  coalesce(nullif(p.scope, ''), 'Complete the project described by the publisher.'),
  coalesce(nullif(p.acceptance_criteria, ''), nullif(p.deliverables, ''), 'Submit the agreed project deliverables.')
from public.projects p
where not exists (
  select 1 from public.project_milestones m where m.project_id = p.id
);

create table if not exists public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'submitted', 'revision_requested', 'approved', 'completed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, student_user_id)
);

create table if not exists public.project_milestone_progress (
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz,
  primary key (assignment_id, milestone_id)
);

alter table public.submissions add column if not exists assignment_id uuid references public.project_assignments(id) on delete cascade;
alter table public.submissions add column if not exists milestone_id uuid references public.project_milestones(id) on delete set null;
create index if not exists submissions_assignment_idx on public.submissions(assignment_id, created_at desc);

alter table public.project_milestones enable row level security;
alter table public.project_assignments enable row level security;
alter table public.project_milestone_progress enable row level security;

create or replace function public.has_my_project_assignment(project_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_assignments a
    where a.project_id = project_uuid and a.student_user_id = auth.uid()
  )
$$;
revoke all on function public.has_my_project_assignment(uuid) from public, anon;
grant execute on function public.has_my_project_assignment(uuid) to authenticated;

create or replace function public.has_my_project_evidence(file_path text, project_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'project-evidence'
      and o.name = file_path
      and (storage.foldername(o.name))[1] = auth.uid()::text
      and (storage.foldername(o.name))[2] = project_uuid::text
  )
$$;
revoke all on function public.has_my_project_evidence(text, uuid) from public, anon;
grant execute on function public.has_my_project_evidence(text, uuid) to authenticated;

drop policy if exists "projects visible" on public.projects;
drop policy if exists "company creates projects" on public.projects;
drop policy if exists "assigning company updates projects" on public.projects;
drop policy if exists "admin creates practice projects" on public.projects;
drop policy if exists "authorized project publishers update projects" on public.projects;
create policy "projects visible" on public.projects for select to authenticated
  using (
    public.is_platform_admin()
    or company_user_id = auth.uid()
    or public.has_my_project_assignment(id)
    or (
      status = 'published'
      and project_source = 'practice'
      and is_industry = false
      and published_by is not null
    )
    or (
      status = 'published'
      and project_source = 'company'
      and is_industry = true
      and exists (
        select 1 from public.companies c
        where c.owner_user_id = public.projects.company_user_id and c.verified = true
      )
    )
  );
create policy "company creates projects" on public.projects for insert to authenticated
  with check (
    company_user_id = auth.uid()
    and project_source = 'company'
    and is_industry = true
    and status = 'draft'
    and publisher_label is null
    and published_by is null
    and public.current_user_role() = 'company_member'::public.app_role
    and exists (
      select 1 from public.companies c
      where c.owner_user_id = auth.uid() and c.verified = true
        and c.id = company_id
    )
  );
create policy "admin creates practice projects" on public.projects for insert to authenticated
  with check (
    public.is_platform_admin()
    and company_user_id is null
    and project_source = 'practice'
    and is_industry = false
    and publisher_label = 'BuildBridge'
    and published_by = auth.uid()
  );
create policy "authorized project publishers update projects" on public.projects for update to authenticated
  using (
    public.is_platform_admin()
    or (
      company_user_id = auth.uid()
      and project_source = 'company'
      and is_industry = true
      and exists (
        select 1 from public.companies c
        where c.owner_user_id = auth.uid() and c.verified = true
      )
    )
  )
  with check (
    public.is_platform_admin()
    or (
      company_user_id = auth.uid()
      and project_source = 'company'
      and is_industry = true
      and status in ('draft', 'published', 'in_progress')
      and exists (
        select 1 from public.companies c
        where c.owner_user_id = auth.uid() and c.verified = true
      )
    )
  );

drop policy if exists "project milestones visible" on public.project_milestones;
drop policy if exists "project publishers manage milestones" on public.project_milestones;
create policy "project milestones visible" on public.project_milestones for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and (
      public.is_platform_admin()
      or p.company_user_id = auth.uid()
      or (p.status = 'published' and (
        (p.project_source = 'practice' and p.published_by is not null)
        or (p.project_source = 'company' and exists (
          select 1 from public.companies c
          where c.owner_user_id = p.company_user_id and c.verified = true
        ))
      ))
    )
  ));
create policy "project publishers manage milestones" on public.project_milestones for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and (
      public.is_platform_admin()
      or (p.company_user_id = auth.uid() and p.project_source = 'company' and exists (
        select 1 from public.companies c
        where c.owner_user_id = auth.uid() and c.verified = true
      ))
    )
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and (
      public.is_platform_admin()
      or (p.company_user_id = auth.uid() and p.project_source = 'company' and exists (
        select 1 from public.companies c
        where c.owner_user_id = auth.uid() and c.verified = true
      ))
    )
  ));

drop policy if exists "student or assigning company reads project assignments" on public.project_assignments;
drop policy if exists "students start published projects" on public.project_assignments;
create policy "student or assigning company reads project assignments" on public.project_assignments for select to authenticated
  using (
    student_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.projects p
      join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
      where p.id = project_id and p.company_user_id = auth.uid() and p.project_source = 'company'
    )
  );
create policy "students start published projects" on public.project_assignments for insert to authenticated
  with check (
    student_user_id = auth.uid()
    and status = 'active'
    and public.current_user_role() = 'student'::public.app_role
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.status = 'published' and (
        (p.project_source = 'practice' and p.is_industry = false and p.published_by is not null)
        or (p.project_source = 'company' and p.is_industry = true and exists (
          select 1 from public.companies c
          where c.owner_user_id = p.company_user_id and c.verified = true
        ))
      )
    )
  );

drop policy if exists "assignment participants read milestone progress" on public.project_milestone_progress;
drop policy if exists "students track assigned milestones" on public.project_milestone_progress;
drop policy if exists "students update own milestone progress" on public.project_milestone_progress;
create policy "assignment participants read milestone progress" on public.project_milestone_progress for select to authenticated
  using (
    student_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.project_assignments a
      join public.projects p on p.id = a.project_id
      join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
      where a.id = assignment_id and p.company_user_id = auth.uid() and p.project_source = 'company'
    )
  );
create policy "students track assigned milestones" on public.project_milestone_progress for insert to authenticated
  with check (
    student_user_id = auth.uid()
    and completed_at is null
    and public.current_user_role() = 'student'::public.app_role
    and exists (
      select 1 from public.project_assignments a
      join public.project_milestones m on m.id = milestone_id and m.project_id = a.project_id
      where a.id = assignment_id and a.student_user_id = auth.uid()
    )
  );
create policy "students update own milestone progress" on public.project_milestone_progress for update to authenticated
  using (
    student_user_id = auth.uid()
    and exists (
      select 1 from public.project_assignments a
      where a.id = assignment_id and a.student_user_id = auth.uid()
        and a.status in ('active', 'submitted', 'revision_requested')
    )
  )
  with check (
    student_user_id = auth.uid()
    and (completed_at is null or exists (
      select 1 from public.submissions s
      where s.assignment_id = public.project_milestone_progress.assignment_id
        and s.milestone_id = public.project_milestone_progress.milestone_id
        and s.student_user_id = auth.uid()
    ))
  );

drop policy if exists "submission student or assigning company reads" on public.submissions;
drop policy if exists "student submits own evidence" on public.submissions;
drop policy if exists "assigning company reviews" on public.submissions;
drop policy if exists "student submits assigned evidence" on public.submissions;
drop policy if exists "verified assigning company reviews submissions" on public.submissions;
create policy "submission student or assigning company reads" on public.submissions for select to authenticated
  using (
    student_user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.projects p
      join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
      where p.id = project_id and p.company_user_id = auth.uid()
        and p.project_source = 'company' and p.is_industry = true
    )
  );
create policy "student submits assigned evidence" on public.submissions for insert to authenticated
  with check (
    student_user_id = auth.uid()
    and assignment_id is not null
    and public.current_user_role() = 'student'::public.app_role
    and status = 'submitted'
    and company_decision is null
    and reviewed_by is null
    and reviewed_at is null
    and (evidence->>'storagePath') like (auth.uid()::text || '/' || project_id::text || '/%')
    and position('..' in (evidence->>'storagePath')) = 0
    and public.has_my_project_evidence(evidence->>'storagePath', project_id)
    and exists (
      select 1 from public.project_assignments a
      join public.projects p on p.id = a.project_id
      where a.id = assignment_id
        and a.project_id = public.submissions.project_id
        and a.student_user_id = auth.uid()
        and (
          a.status in ('active', 'submitted', 'revision_requested')
        )
    )
    and (
      milestone_id is not null
      and exists (
        select 1 from public.project_milestones m
        where m.id = milestone_id and m.project_id = public.submissions.project_id
      )
    )
  );
create policy "verified assigning company reviews submissions" on public.submissions for update to authenticated
  using (exists (
    select 1 from public.projects p
    join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
    where p.id = project_id and p.company_user_id = auth.uid()
      and p.project_source = 'company' and p.is_industry = true
  ) and company_decision is null)
  with check (
    reviewed_by = auth.uid()
    and company_decision in ('approved', 'revision_requested')
    and exists (
      select 1 from public.projects p
      join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
      where p.id = project_id and p.company_user_id = auth.uid()
        and p.project_source = 'company' and p.is_industry = true
    )
  );

create or replace function public.protect_assigned_project_brief()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin()
    and exists (select 1 from public.project_assignments a where a.project_id = old.id)
    and (
      old.title is distinct from new.title
      or old.problem_statement is distinct from new.problem_statement
      or old.scope is distinct from new.scope
      or old.deliverables is distinct from new.deliverables
      or old.acceptance_criteria is distinct from new.acceptance_criteria
      or old.deadline is distinct from new.deadline
      or old.revision_policy is distinct from new.revision_policy
      or old.payment_terms is distinct from new.payment_terms
      or old.category is distinct from new.category
      or old.difficulty is distinct from new.difficulty
      or old.project_type is distinct from new.project_type
      or old.required_skills is distinct from new.required_skills
      or old.estimated_duration_days is distinct from new.estimated_duration_days
      or old.requirements is distinct from new.requirements
      or old.submission_format is distinct from new.submission_format
      or old.resources is distinct from new.resources
      or old.evaluation_rubric is distinct from new.evaluation_rubric
    )
  then
    raise exception 'A project brief cannot be changed after students start assignments.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_assigned_project_brief_trigger on public.projects;
create trigger protect_assigned_project_brief_trigger
before update on public.projects
for each row execute function public.protect_assigned_project_brief();

create or replace function public.protect_assigned_project_milestones()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  project_uuid uuid;
begin
  project_uuid := case when tg_op = 'DELETE' then old.project_id else new.project_id end;
  if not public.is_platform_admin()
    and exists (select 1 from public.project_assignments a where a.project_id = project_uuid)
  then
    raise exception 'Project milestones cannot be changed after students start assignments.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists protect_assigned_project_milestones_trigger on public.project_milestones;
create trigger protect_assigned_project_milestones_trigger
before insert or update or delete on public.project_milestones
for each row execute function public.protect_assigned_project_milestones();

revoke update on public.projects from authenticated;
grant update (
  title, scope, deliverables, acceptance_criteria, deadline, revision_policy,
  payment_terms, status, category, difficulty, project_type, required_skills,
  estimated_duration_days, problem_statement, requirements, submission_format,
  resources, evaluation_rubric, published_by, updated_at
) on public.projects to authenticated;

revoke all on public.project_milestones from authenticated;
grant select, insert, update, delete on public.project_milestones to authenticated;
revoke all on public.project_assignments from authenticated;
grant select on public.project_assignments to authenticated;
grant insert (project_id, student_user_id) on public.project_assignments to authenticated;
revoke all on public.project_milestone_progress from authenticated;
grant select, insert on public.project_milestone_progress to authenticated;
grant update (completed_at) on public.project_milestone_progress to authenticated;

revoke update on public.submissions from authenticated;
grant update (company_decision, company_feedback, reviewed_by, reviewed_at, status)
  on public.submissions to authenticated;

drop policy if exists "evidence upload own folder" on storage.objects;
drop policy if exists "evidence read own or admin" on storage.objects;
drop policy if exists "evidence upload for own assignment" on storage.objects;
drop policy if exists "evidence readable by participants" on storage.objects;
create policy "evidence upload for own assignment" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.project_assignments a
      where a.student_user_id = auth.uid()
        and a.project_id::text = (storage.foldername(name))[2]
        and a.status in ('active', 'revision_requested', 'submitted')
    )
  );
create policy "evidence readable by participants" on storage.objects for select to authenticated
  using (
    bucket_id = 'project-evidence'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_platform_admin()
      or exists (
        select 1 from public.project_assignments a
        join public.projects p on p.id = a.project_id
        join public.companies c on c.owner_user_id = p.company_user_id and c.verified = true
        where a.project_id::text = (storage.foldername(name))[2]
          and a.student_user_id::text = (storage.foldername(name))[1]
          and p.company_user_id = auth.uid()
          and p.project_source = 'company'
      )
    )
  );
drop policy if exists "remove unused evidence upload" on storage.objects;
create policy "remove unused evidence upload" on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.project_assignments a
      where a.student_user_id = auth.uid()
        and a.project_id::text = (storage.foldername(name))[2]
    )
    and not exists (
      select 1 from public.submissions s
      where s.student_user_id = auth.uid()
        and s.evidence->>'storagePath' = name
    )
  );

create or replace function public.update_assignment_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if old.company_decision = 'approved'
      and old.company_decision is distinct from new.company_decision
    then
      raise exception 'An approved submission cannot be reopened.';
    end if;
    if new.company_decision = 'revision_requested'
      and old.company_decision is distinct from new.company_decision
      and new.assignment_id is not null
      and new.milestone_id is not null
    then
      update public.project_milestone_progress
      set completed_at = null
      where assignment_id = new.assignment_id and milestone_id = new.milestone_id;
    end if;
  end if;
  if new.assignment_id is not null then
    update public.project_assignments
    set status = case
      when new.company_decision = 'revision_requested' then 'revision_requested'
      when new.company_decision = 'approved' and exists (
        select 1
        from public.project_milestones m
        left join public.project_milestone_progress mp
          on mp.milestone_id = m.id and mp.assignment_id = new.assignment_id
        where m.project_id = new.project_id and mp.completed_at is null
      ) then 'active'
      when new.company_decision = 'approved' then 'approved'
      else 'submitted'
    end,
    updated_at = now()
    where id = new.assignment_id;
  end if;
  return new;
end;
$$;
drop trigger if exists assignment_status_after_submission on public.submissions;
create trigger assignment_status_after_submission
after insert or update of company_decision on public.submissions
for each row execute function public.update_assignment_from_submission();

create or replace function public.issue_industry_certificate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_row public.projects;
begin
  if new.company_decision = 'approved' and old.company_decision is distinct from 'approved' then
    select * into project_row from public.projects where id = new.project_id;
    if project_row.is_industry
      and project_row.project_source = 'company'
      and project_row.company_user_id = new.reviewed_by
      and exists (
        select 1 from public.companies c
        where c.owner_user_id = project_row.company_user_id and c.verified = true
      )
    then
      insert into public.certificates(student_user_id, project_id, submission_id)
      values (new.student_user_id, new.project_id, new.id)
      on conflict (submission_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

with seed_projects (
  slug, title, category, difficulty, project_type, skills, duration_days,
  problem_statement, scope, deliverables, acceptance_criteria, requirements,
  submission_format, resources, evaluation_rubric
) as (
  values
  (
    'retail-demand-stock-dashboard', 'Retail Demand and Stock Dashboard', 'Data Analytics', 'Intermediate', 'Analytics project',
    array['SQL','Excel','Data visualization'], 18,
    'A small retailer has sales and inventory exports but cannot identify products at risk of stockout or overstock. Build a clear analysis that supports weekly replenishment decisions.',
    'Clean the supplied or self-created sample data, define stock-health metrics, and communicate trends without claiming the sample represents a real business.',
    'Reproducible analysis, dashboard or report, metric definitions, and a short decision memo.',
    'Calculations are reproducible; data limitations are stated; charts answer the defined stock questions; recommendations cite evidence.',
    '["Document the source and limitations of every dataset.","Include a data dictionary and explain missing-value handling.","Do not present synthetic data as a real retailer record."]'::jsonb,
    'Git repository or notebook, exported dashboard/report, and README.',
    '[{"label":"PostgreSQL documentation","url":"https://www.postgresql.org/docs/"},{"label":"Tableau Public","url":"https://public.tableau.com/"}]'::jsonb,
    '[{"criterion":"Data quality and reproducibility","weight":30},{"criterion":"Metric correctness","weight":30},{"criterion":"Communication and decisions","weight":25},{"criterion":"Limitations and documentation","weight":15}]'::jsonb
  ),
  (
    'public-transit-reliability-analysis', 'Public Transit Reliability Analysis', 'Data Analytics', 'Intermediate', 'Data analysis',
    array['Python','Pandas','Statistics','Data visualization'], 16,
    'Riders need to understand when and where a transit service is least reliable. Analyze an openly licensed or clearly labeled sample of service data and explain the patterns.',
    'Develop a reproducible exploratory analysis of delays by route, time, or service condition. Keep correlation separate from causation.',
    'Notebook or scripts, concise visual report, documented dataset source, and three evidence-backed findings.',
    'The dataset source and license are recorded; analysis can be rerun; charts include units and context; conclusions do not exceed the evidence.',
    '["Use public or synthetic data only.","Record data cleaning decisions and time-zone assumptions.","Do not identify individual riders or publish personal data."]'::jsonb,
    'Notebook or repository with exported charts and a short findings report.',
    '[{"label":"Pandas user guide","url":"https://pandas.pydata.org/docs/user_guide/"},{"label":"OpenStreetMap","url":"https://www.openstreetmap.org/copyright"}]'::jsonb,
    '[{"criterion":"Data sourcing and cleaning","weight":25},{"criterion":"Analytical validity","weight":35},{"criterion":"Visualization","weight":25},{"criterion":"Reproducibility","weight":15}]'::jsonb
  ),
  (
    'subscription-churn-explorer', 'Subscription Churn Explorer', 'Data Analytics', 'Beginner', 'Analytics project',
    array['SQL','Excel','Product metrics'], 12,
    'A subscription service wants a transparent view of customer retention. Use a public or synthetic dataset to define churn consistently and identify segments worth investigating.',
    'Build a small metric pipeline and dashboard that compares retention cohorts and explains the limits of the sample.',
    'Metric definitions, cohort query or notebook, dashboard, and a prioritized list of follow-up questions.',
    'Churn formula and time window are explicit; cohort calculations are testable; sample and survivorship limitations are disclosed.',
    '["Use only public or synthetic customer records.","Do not infer sensitive traits or make unsupported causal claims.","Include a data dictionary."]'::jsonb,
    'Repository or notebook with SQL, dashboard export, and README.',
    '[{"label":"SQLite documentation","url":"https://www.sqlite.org/docs.html"},{"label":"Metabase documentation","url":"https://www.metabase.com/docs/latest/"}]'::jsonb,
    '[{"criterion":"Metric definitions","weight":25},{"criterion":"Query and analysis quality","weight":35},{"criterion":"Dashboard clarity","weight":25},{"criterion":"Responsible interpretation","weight":15}]'::jsonb
  ),
  (
    'volunteer-matching-board', 'Community Volunteer Matching Board', 'Full-stack Development', 'Intermediate', 'Web application',
    array['TypeScript','React','APIs','SQL','Accessibility'], 24,
    'Community groups often coordinate volunteer shifts through scattered messages. Create a small application that lets organizers publish opportunities and volunteers find suitable shifts.',
    'Build a responsive browse-and-detail experience with validated forms and a persistent data model. Use fictional sample organizations and do not imply real partnerships.',
    'Working application, schema or migrations, test coverage for key flows, setup instructions, and screenshots.',
    'Users can browse and filter opportunities; forms validate required fields; empty/error states are clear; keyboard navigation works; sample records are labeled.',
    '["No real personal data or live organization claims.","Protect organizer-only actions with authorization checks.","Document any external services and their limits."]'::jsonb,
    'Git repository with run instructions, test output, and a deployed demo only if safely hosted.',
    '[{"label":"Next.js documentation","url":"https://nextjs.org/docs"},{"label":"WAI accessibility standards","url":"https://www.w3.org/WAI/standards-guidelines/wcag/"}]'::jsonb,
    '[{"criterion":"Core user flows","weight":30},{"criterion":"Data model and validation","weight":25},{"criterion":"Accessibility and responsive UI","weight":25},{"criterion":"Testing and documentation","weight":20}]'::jsonb
  ),
  (
    'accessible-event-booking', 'Accessible Community Event Booking', 'Full-stack Development', 'Advanced', 'Web application',
    array['React','Node.js','SQL','Testing','Accessibility'], 28,
    'An event organizer needs a simple way to publish events and accept bookings while making capacity and accessibility information easy to understand.',
    'Implement event discovery, capacity-aware booking, cancellation, and clear accessibility details using a fictional dataset.',
    'Responsive application, booking data model, automated tests for capacity rules, and accessibility notes.',
    'Bookings cannot exceed capacity; duplicate booking is prevented; cancellation updates availability; form errors are announced; event data is clearly sample content.',
    '["Do not collect payment data.","Use fictional event and attendee records.","Document how race conditions and concurrent booking are handled."]'::jsonb,
    'Repository with tests, schema, setup guide, and a short accessibility checklist.',
    '[{"label":"React documentation","url":"https://react.dev/learn"},{"label":"WAI forms guidance","url":"https://www.w3.org/WAI/tutorials/forms/"}]'::jsonb,
    '[{"criterion":"Booking correctness","weight":35},{"criterion":"Accessibility","weight":25},{"criterion":"Testing and edge cases","weight":25},{"criterion":"Code and setup quality","weight":15}]'::jsonb
  ),
  (
    'community-repair-tracker', 'Community Repair Request Tracker', 'Full-stack Development', 'Beginner', 'Web application',
    array['JavaScript','HTML','CSS','CRUD','SQL'], 14,
    'A neighborhood repair group needs a lightweight way to track reported issues from intake through resolution without exposing reporters’ personal details.',
    'Create a CRUD application with status transitions, basic search, and fictional issue records. Focus on reliable state changes and clear status communication.',
    'Runnable application, schema, validation rules, test cases, and a short user guide.',
    'Required fields are validated; allowed status transitions are enforced; search returns relevant records; empty and error states are usable.',
    '["Use fictional reports only.","Avoid collecting precise home addresses or sensitive information.","Include a resettable demo dataset."]'::jsonb,
    'Git repository with test evidence and a brief demo walkthrough.',
    '[{"label":"MDN Web Docs","url":"https://developer.mozilla.org/en-US/docs/Learn"},{"label":"SQLBolt lessons","url":"https://sqlbolt.com/"}]'::jsonb,
    '[{"criterion":"CRUD behavior","weight":35},{"criterion":"Validation and state transitions","weight":25},{"criterion":"Usability","weight":25},{"criterion":"Documentation","weight":15}]'::jsonb
  ),
  (
    'plant-leaf-image-classifier', 'Plant Leaf Image Classifier', 'AI/ML', 'Intermediate', 'Machine learning project',
    array['Python','Machine Learning','Model evaluation','Data visualization'], 21,
    'A learning team wants a reproducible image-classification experiment for common plant leaf categories. The model is educational and must not be presented as authoritative agricultural advice.',
    'Prepare a documented dataset, establish a baseline, train and evaluate a model, and describe failure cases and dataset limitations.',
    'Reproducible training notebook or scripts, evaluation report, confusion matrix, model card, and inference example.',
    'Train/test separation is documented; metrics include per-class performance; limitations and uncertainty are explicit; no unsupported real-world accuracy claims.',
    '["Use a dataset with a compatible license and document attribution.","Do not claim the model diagnoses crop disease in production.","Do not upload private images."]'::jsonb,
    'Repository, notebook, model card, and a small set of non-sensitive test examples.',
    '[{"label":"scikit-learn documentation","url":"https://scikit-learn.org/stable/user_guide.html"},{"label":"TensorFlow tutorials","url":"https://www.tensorflow.org/tutorials"}]'::jsonb,
    '[{"criterion":"Data and reproducibility","weight":25},{"criterion":"Evaluation quality","weight":35},{"criterion":"Failure analysis and safety","weight":25},{"criterion":"Documentation","weight":15}]'::jsonb
  ),
  (
    'support-ticket-topic-classifier', 'Support Ticket Topic Classifier', 'AI/ML', 'Beginner', 'Natural language processing',
    array['Python','NLP','Pandas','Model evaluation'], 15,
    'A support team receives repetitive requests and wants to explore whether a small classifier can help route messages. Use a public or synthetic text dataset and keep a human in the loop.',
    'Compare a simple baseline with one improved model, inspect errors, and propose a safe review workflow rather than automatic customer-impacting decisions.',
    'Data preparation notebook, baseline comparison, error analysis, model card, and a short human-review proposal.',
    'Data provenance and text privacy are documented; evaluation uses a held-out set; class imbalance and errors are discussed; automation limits are stated.',
    '["Never use private support conversations.","Use synthetic or licensed public text.","The model must not automatically deny service or make consequential decisions."]'::jsonb,
    'Repository with notebook, model card, and a concise human-review workflow.',
    '[{"label":"Hugging Face course","url":"https://huggingface.co/learn/nlp-course/"},{"label":"scikit-learn model evaluation","url":"https://scikit-learn.org/stable/modules/model_evaluation.html"}]'::jsonb,
    '[{"criterion":"Baseline and evaluation","weight":30},{"criterion":"Error and bias analysis","weight":30},{"criterion":"Privacy and human oversight","weight":25},{"criterion":"Reproducibility","weight":15}]'::jsonb
  ),
  (
    'phishing-email-triage-lab', 'Phishing Email Triage Lab', 'Cybersecurity', 'Intermediate', 'Defensive security analysis',
    array['Cybersecurity','Email security','Threat analysis','Documentation'], 16,
    'A small security team needs a repeatable, defensive checklist for assessing suspicious email reports. Build a safe triage guide and classifier experiment using synthetic examples only.',
    'Document observable indicators, create benign synthetic samples, and evaluate a transparent triage workflow that escalates uncertain cases to a human analyst.',
    'Triage playbook, synthetic test set, evaluation summary, and safe escalation checklist.',
    'Examples contain no active malicious links or payloads; indicators are explained; false positives are considered; users are not instructed to interact with suspicious content.',
    '["Use synthetic examples only.","Do not create credential-harvesting pages or deploy malicious content.","Keep all links inert and clearly labeled as examples."]'::jsonb,
    'Defensive report and inert synthetic examples in a repository.',
    '[{"label":"OWASP Cheat Sheet Series","url":"https://cheatsheetseries.owasp.org/"},{"label":"CISA phishing guidance","url":"https://www.cisa.gov/secure-our-world/recognize-and-report-phishing"}]'::jsonb,
    '[{"criterion":"Safe triage process","weight":30},{"criterion":"Indicator analysis","weight":25},{"criterion":"Evaluation and limitations","weight":25},{"criterion":"Clarity and safety","weight":20}]'::jsonb
  ),
  (
    'secure-api-threat-model', 'Secure API Threat Modeling', 'Cybersecurity', 'Advanced', 'Security design review',
    array['Cybersecurity','API security','Threat modeling','OWASP'], 20,
    'A fictional task-management API is being prepared for launch. Review its design on paper and identify authorization, input-validation, data-exposure, and operational risks.',
    'Create a threat model and defensive test plan for a deliberately fictional API specification. The task is analysis and remediation design, not testing a real third-party target.',
    'Data-flow diagram, prioritized threat register, defensive test cases, and remediation checklist.',
    'Scope is limited to the supplied fictional design; each risk has impact and mitigation; tests are non-destructive and locally reproducible.',
    '["Do not scan or test systems you do not own or have explicit permission to assess.","Use the fictional API brief only.","Report risks responsibly and avoid exploit payloads."]'::jsonb,
    'Threat model report and local-only defensive test plan.',
    '[{"label":"OWASP API Security Top 10","url":"https://owasp.org/www-project-api-security/"},{"label":"OWASP Threat Modeling","url":"https://owasp.org/www-community/Threat_Modeling"}]'::jsonb,
    '[{"criterion":"Scope and data-flow model","weight":25},{"criterion":"Risk prioritization","weight":30},{"criterion":"Defensive mitigations","weight":30},{"criterion":"Safe, clear documentation","weight":15}]'::jsonb
  ),
  (
    'product-onboarding-funnel-case', 'Product Onboarding Funnel Case Study', 'Product Management', 'Beginner', 'Product analytics case study',
    array['Product analytics','Metrics','SQL','Communication'], 12,
    'A fictional learning app sees fewer new users finish onboarding than expected. Analyze a synthetic funnel and recommend the next research or experiment step without claiming a proven cause.',
    'Define the activation event, calculate stage conversion, identify data-quality questions, and propose a measurable experiment with guardrails.',
    'Metric tree, funnel analysis, experiment brief, and stakeholder-ready recommendation.',
    'Events and denominator are explicit; calculations are reproducible; recommendations distinguish evidence from assumptions; guardrail metrics are included.',
    '["Use synthetic event data only.","Do not infer sensitive user characteristics.","State what additional research is needed before shipping a change."]'::jsonb,
    'Short case study with spreadsheet or notebook and an experiment brief.',
    '[{"label":"Amplitude product analytics guides","url":"https://amplitude.com/docs"},{"label":"Google HEART framework overview","url":"https://research.google/pubs/measuring-the-user-experience-on-a-large-scale-user-centered-metrics-for-web-applications/"}]'::jsonb,
    '[{"criterion":"Problem and metric framing","weight":25},{"criterion":"Funnel analysis","weight":30},{"criterion":"Experiment quality","weight":30},{"criterion":"Communication and caveats","weight":15}]'::jsonb
  ),
  (
    'feature-prioritization-workshop', 'Feature Prioritization Workshop', 'Product Management', 'Intermediate', 'Product strategy case study',
    array['Product strategy','Prioritization','User research','Communication'], 14,
    'A fictional community-learning product has more feature requests than capacity. Create a transparent prioritization recommendation using stated user needs, effort assumptions, and product goals.',
    'Compare a small set of fictional feature proposals, surface uncertainty, and describe how the team could validate the highest-risk assumptions.',
    'Prioritization framework, decision table, concise roadmap proposal, and validation plan.',
    'Criteria and weights are explained; assumptions are visible; trade-offs and excluded ideas are documented; recommendations include measurable outcomes.',
    '["Treat all user feedback as fictional case material.","Do not claim to represent actual BuildBridge users or company strategy.","Include an uncertainty and validation section."]'::jsonb,
    'Decision memo, spreadsheet or board export, and a short presentation.',
    '[{"label":"ProductPlan prioritization guide","url":"https://www.productplan.com/learn/product-prioritization/"},{"label":"Nielsen Norman Group research methods","url":"https://www.nngroup.com/articles/which-ux-research-methods/"}]'::jsonb,
    '[{"criterion":"Decision criteria","weight":25},{"criterion":"Evidence and assumptions","weight":25},{"criterion":"Trade-off reasoning","weight":30},{"criterion":"Validation plan","weight":20}]'::jsonb
  )
)
insert into public.projects (
  slug, title, company_user_id, company_id, project_source, publisher_label, published_by, is_industry,
  category, difficulty, project_type, required_skills, estimated_duration_days,
  problem_statement, scope, deliverables, acceptance_criteria, requirements,
  submission_format, resources, evaluation_rubric, status, revision_policy, payment_terms
)
select
  s.slug, s.title, null, null, 'practice', 'BuildBridge', admin_profile.id, false,
  s.category, s.difficulty, s.project_type, s.skills, s.duration_days,
  s.problem_statement, s.scope, s.deliverables, s.acceptance_criteria, s.requirements,
  s.submission_format, s.resources, s.evaluation_rubric,
  case when admin_profile.id is null then 'draft'::public.project_status else 'published'::public.project_status end,
  'Practice feedback is for learning and does not constitute employer review.', null
from seed_projects s
left join lateral (
  select id from public.profiles
  where role = 'admin'::public.app_role
  order by created_at
  limit 1
) admin_profile on true
on conflict (slug) where slug is not null do nothing;

update public.projects p
set published_by = admin_profile.id,
    status = 'published'
from (
  select id from public.profiles
  where role = 'admin'::public.app_role
  order by created_at
  limit 1
) admin_profile
where p.project_source = 'practice'
  and p.publisher_label = 'BuildBridge'
  and p.published_by is null;

update public.projects
set status = 'draft'
where project_source = 'practice'
  and publisher_label = 'BuildBridge'
  and published_by is null
  and status = 'published';

with seed_milestones (slug, sequence, title, description, acceptance_criteria) as (
  values
  ('retail-demand-stock-dashboard',1,'Define the data and decision','Document the dataset, data dictionary, stock-health question, and metrics.','Dataset source, assumptions, and metric definitions are recorded.'),
  ('retail-demand-stock-dashboard',2,'Analyze and visualize','Build reproducible queries or analysis and a dashboard for stock risk.','Charts are labeled, calculations can be checked, and data limits are visible.'),
  ('retail-demand-stock-dashboard',3,'Present recommendations','Write a concise replenishment decision memo supported by findings.','Each recommendation links to evidence and avoids unsupported claims.'),
  ('public-transit-reliability-analysis',1,'Source and prepare data','Choose a licensed or synthetic dataset and document cleaning steps.','Source, license, time zone, and cleaning decisions are documented.'),
  ('public-transit-reliability-analysis',2,'Explore reliability patterns','Calculate delay measures and compare relevant service segments.','Queries are reproducible and comparisons include context and units.'),
  ('public-transit-reliability-analysis',3,'Communicate findings','Prepare visual findings and caveats for a non-technical audience.','At least three findings are evidence-backed and limitations are explicit.'),
  ('subscription-churn-explorer',1,'Define retention metrics','Create a data dictionary and define churn and observation windows.','Metric formulas and time windows are explicit and testable.'),
  ('subscription-churn-explorer',2,'Build cohort analysis','Implement reproducible cohort queries and a simple dashboard.','Cohorts use consistent definitions and charts show denominators.'),
  ('subscription-churn-explorer',3,'Recommend follow-up research','Summarize segments, limitations, and next questions.','Recommendations distinguish observed patterns from causal claims.'),
  ('volunteer-matching-board',1,'Model the application data','Design opportunity and volunteer-facing data without sensitive details.','Schema and authorization boundaries are documented.'),
  ('volunteer-matching-board',2,'Build discovery and organizer flows','Implement browse, filter, detail, and validated publishing screens.','Core flows work with labeled sample records and clear empty/error states.'),
  ('volunteer-matching-board',3,'Test and document','Add key-flow tests, accessibility checks, and setup instructions.','Tests pass and keyboard navigation works for core tasks.'),
  ('accessible-event-booking',1,'Design event and booking rules','Define event capacity, booking uniqueness, and accessibility fields.','Rules cover duplicates, full events, cancellation, and validation.'),
  ('accessible-event-booking',2,'Implement booking flows','Build event discovery and capacity-aware booking with safe sample data.','Concurrent and duplicate booking behavior is documented and tested.'),
  ('accessible-event-booking',3,'Validate accessibility and edge cases','Test keyboard, form announcements, and capacity boundaries.','Accessibility checklist and automated edge-case tests are included.'),
  ('community-repair-tracker',1,'Define the issue lifecycle','Specify required fields and allowed status transitions.','Lifecycle and privacy boundaries are written down.'),
  ('community-repair-tracker',2,'Build and validate CRUD flows','Implement create, search, update, and resolved-state behavior.','Invalid transitions and missing values are rejected clearly.'),
  ('community-repair-tracker',3,'Prepare demo and tests','Add fictional demo data, tests, and a concise user guide.','Demo data is resettable and tests cover state changes.'),
  ('plant-leaf-image-classifier',1,'Prepare an attributed dataset','Select licensed images and record preprocessing and splits.','Attribution, split method, and class distribution are documented.'),
  ('plant-leaf-image-classifier',2,'Train and evaluate a baseline','Train a reproducible baseline and report per-class metrics.','Held-out evaluation and confusion matrix are included.'),
  ('plant-leaf-image-classifier',3,'Explain failure cases','Write a model card and safe usage limitations.','Uncertainty and educational-only scope are prominent.'),
  ('support-ticket-topic-classifier',1,'Prepare safe text data','Select synthetic or licensed data and document privacy limits.','No private support conversations are used.'),
  ('support-ticket-topic-classifier',2,'Compare baseline models','Evaluate a simple baseline and one alternative on held-out data.','Metrics and class imbalance are reported.'),
  ('support-ticket-topic-classifier',3,'Design human review','Analyze errors and propose a human-in-the-loop process.','No consequential automatic decisions are proposed.'),
  ('phishing-email-triage-lab',1,'Create a safe triage checklist','Define inert indicators and escalation steps for suspicious reports.','Guidance is defensive and avoids interacting with suspicious content.'),
  ('phishing-email-triage-lab',2,'Evaluate synthetic cases','Use benign synthetic messages to exercise the checklist.','Examples contain no active links or payloads and include expected outcomes.'),
  ('phishing-email-triage-lab',3,'Document limitations and escalation','Summarize false positives, uncertainty, and human escalation.','Triage limitations and escalation contacts are clearly explained.'),
  ('secure-api-threat-model',1,'Model the fictional API','Create a data-flow diagram and define the authorized scope.','Only the supplied fictional design is in scope.'),
  ('secure-api-threat-model',2,'Prioritize defensive risks','Assess authorization, validation, exposure, and operational risks.','Each risk has rationale, impact, and a defensible priority.'),
  ('secure-api-threat-model',3,'Propose mitigations and checks','Write non-destructive local checks and remediation guidance.','Checks are safe and mitigations map to the identified risks.'),
  ('product-onboarding-funnel-case',1,'Define activation and funnel events','Document events, denominators, and data-quality questions.','Metric tree and event assumptions are explicit.'),
  ('product-onboarding-funnel-case',2,'Analyze the synthetic funnel','Calculate stage conversion and identify where evidence is weak.','Calculations are reproducible and caveats are recorded.'),
  ('product-onboarding-funnel-case',3,'Propose an experiment','Write an experiment brief with success and guardrail metrics.','Experiment distinguishes hypotheses from findings.'),
  ('feature-prioritization-workshop',1,'Frame goals and criteria','Define fictional user needs, product goals, and prioritization criteria.','Criteria and weights are transparent.'),
  ('feature-prioritization-workshop',2,'Compare feature options','Score fictional proposals and explain trade-offs and uncertainty.','Decision table shows assumptions and excluded ideas.'),
  ('feature-prioritization-workshop',3,'Plan validation','Recommend research to test the riskiest assumptions.','Validation steps have measurable outcomes and owners.'),
  ('retail-demand-stock-dashboard',4,'Share the final evidence','Submit the repository or analysis files and a reflection.','Submission format and key decisions are documented.'),
  ('public-transit-reliability-analysis',4,'Share the final evidence','Submit the repository or notebook and a reflection.','Analysis can be rerun from the instructions.'),
  ('subscription-churn-explorer',4,'Share the final evidence','Submit the repository or notebook and a reflection.','Metrics, dashboard, and caveats are included.'),
  ('volunteer-matching-board',4,'Share the final evidence','Submit the application repository and test evidence.','Setup, tests, and sample-data limits are documented.'),
  ('accessible-event-booking',4,'Share the final evidence','Submit the application repository and accessibility evidence.','Booking rules, tests, and accessibility notes are included.'),
  ('community-repair-tracker',4,'Share the final evidence','Submit the application repository and user guide.','Lifecycle tests and privacy limitations are documented.'),
  ('plant-leaf-image-classifier',4,'Share the final evidence','Submit the model card, evaluation, and reproducible code.','Educational scope and attribution are included.'),
  ('support-ticket-topic-classifier',4,'Share the final evidence','Submit the model comparison and human-review proposal.','Privacy and automation limits are explicit.'),
  ('phishing-email-triage-lab',4,'Share the final evidence','Submit the defensive playbook and inert synthetic examples.','No active malicious content is included.'),
  ('secure-api-threat-model',4,'Share the final evidence','Submit the fictional API threat model and defensive checklist.','Scope and non-destructive approach are explicit.'),
  ('product-onboarding-funnel-case',4,'Share the final evidence','Submit the case study and experiment brief.','Metrics and caveats are easy to review.'),
  ('feature-prioritization-workshop',4,'Share the final evidence','Submit the decision memo and validation plan.','Trade-offs and assumptions are documented.')
)
insert into public.project_milestones(project_id, sequence, title, description, acceptance_criteria)
select p.id, m.sequence, m.title, m.description, m.acceptance_criteria
from seed_milestones m
join public.projects p on p.slug = m.slug
on conflict (project_id, sequence) do nothing;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.project_milestones to authenticated;
grant select on public.project_assignments to authenticated;
grant insert (project_id, student_user_id) on public.project_assignments to authenticated;

notify pgrst, 'reload schema';
