begin;

-- This migration extends the existing BuildBridge schema. It does not replace
-- projects, submissions, certificates, profiles, or companies.

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

alter table public.project_milestones
  add column if not exists sequence_number integer,
  add column if not exists required_deliverables jsonb not null default '[]'::jsonb,
  add column if not exists deadline date,
  add column if not exists is_required boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.project_milestones
set sequence_number = sequence
where sequence_number is null;

alter table public.project_milestones
  alter column sequence_number set not null;

create unique index if not exists project_milestones_project_sequence_number_unique
  on public.project_milestones(project_id, sequence_number);

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

alter table public.project_assignments
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists company_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

do $$
declare
  milestone_project_attnum smallint;
  assignment_project_attnum smallint;
  assignment_student_attnum smallint;
  assignment_company_attnum smallint;
  assignment_company_user_attnum smallint;
  assignment_by_attnum smallint;
begin
  select attnum into milestone_project_attnum
  from pg_attribute
  where attrelid = 'public.project_milestones'::regclass
    and attname = 'project_id' and not attisdropped;
  select attnum into assignment_project_attnum
  from pg_attribute
  where attrelid = 'public.project_assignments'::regclass
    and attname = 'project_id' and not attisdropped;
  select attnum into assignment_student_attnum
  from pg_attribute
  where attrelid = 'public.project_assignments'::regclass
    and attname = 'student_user_id' and not attisdropped;
  select attnum into assignment_company_attnum
  from pg_attribute
  where attrelid = 'public.project_assignments'::regclass
    and attname = 'company_id' and not attisdropped;
  select attnum into assignment_company_user_attnum
  from pg_attribute
  where attrelid = 'public.project_assignments'::regclass
    and attname = 'company_user_id' and not attisdropped;
  select attnum into assignment_by_attnum
  from pg_attribute
  where attrelid = 'public.project_assignments'::regclass
    and attname = 'assigned_by' and not attisdropped;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_milestones'::regclass
      and c.confrelid = 'public.projects'::regclass and c.contype = 'f'
      and c.conkey = array[milestone_project_attnum]::smallint[]
  ) then
    alter table public.project_milestones
      add constraint project_milestones_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_assignments'::regclass
      and c.confrelid = 'public.projects'::regclass and c.contype = 'f'
      and c.conkey = array[assignment_project_attnum]::smallint[]
  ) then
    alter table public.project_assignments
      add constraint project_assignments_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_assignments'::regclass
      and c.confrelid = 'public.profiles'::regclass and c.contype = 'f'
      and c.conkey = array[assignment_student_attnum]::smallint[]
  ) then
    alter table public.project_assignments
      add constraint project_assignments_student_user_id_fkey
      foreign key (student_user_id) references public.profiles(id) on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_assignments'::regclass
      and c.confrelid = 'public.companies'::regclass and c.contype = 'f'
      and c.conkey = array[assignment_company_attnum]::smallint[]
  ) then
    alter table public.project_assignments
      add constraint project_assignments_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_assignments'::regclass
      and c.confrelid = 'public.profiles'::regclass and c.contype = 'f'
      and c.conkey = array[assignment_company_user_attnum]::smallint[]
  ) then
    alter table public.project_assignments
      add constraint project_assignments_company_user_id_fkey
      foreign key (company_user_id) references public.profiles(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.project_assignments'::regclass
      and c.confrelid = 'public.profiles'::regclass and c.contype = 'f'
      and c.conkey = array[assignment_by_attnum]::smallint[]
  ) then
    alter table public.project_assignments
      add constraint project_assignments_assigned_by_fkey
      foreign key (assigned_by) references public.profiles(id) on delete set null;
  end if;
end
$$;

update public.project_assignments a
set company_id = coalesce(a.company_id, p.company_id, c.id),
    company_user_id = coalesce(a.company_user_id, p.company_user_id),
    assigned_by = coalesce(a.assigned_by, a.student_user_id),
    created_at = coalesce(a.created_at, a.started_at),
    completed_at = case
      when a.status in ('approved', 'completed') then coalesce(a.completed_at, a.updated_at, a.started_at)
      else a.completed_at
    end
from public.projects p
left join public.companies c on c.owner_user_id = p.company_user_id
where p.id = a.project_id;

create table if not exists public.project_milestone_progress (
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz,
  primary key (assignment_id, milestone_id)
);

create table if not exists public.project_assignment_milestones (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  milestone_id uuid not null references public.project_milestones(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'submitted', 'revision_requested', 'approved', 'completed')),
  submission_id uuid references public.submissions(id) on delete set null,
  feedback text,
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, milestone_id)
);

create or replace function public.validate_assignment_milestone_pair()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.project_assignments a
    join public.project_milestones m on m.project_id = a.project_id
    where a.id = new.assignment_id and m.id = new.milestone_id
  ) then
    raise exception 'An assignment milestone must connect an assignment and milestone from the same project.';
  end if;
  if new.submission_id is not null and not exists (
    select 1 from public.submissions s
    where s.id = new.submission_id
      and s.assignment_id = new.assignment_id
      and s.milestone_id = new.milestone_id
  ) then
    raise exception 'The linked submission must belong to this assignment milestone.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_assignment_milestone_pair() from public, anon, authenticated;
drop trigger if exists validate_assignment_milestone_pair_trigger on public.project_assignment_milestones;
create trigger validate_assignment_milestone_pair_trigger
before insert or update on public.project_assignment_milestones
for each row execute function public.validate_assignment_milestone_pair();

alter table public.submissions
  add column if not exists assignment_id uuid,
  add column if not exists milestone_id uuid;

-- Keep old submissions intact when an assignment or milestone is removed.
do $$
declare
  constraint_row record;
  assignment_attnum smallint;
  milestone_attnum smallint;
begin
  select attnum into assignment_attnum
  from pg_attribute
  where attrelid = 'public.submissions'::regclass
    and attname = 'assignment_id'
    and not attisdropped;

  select attnum into milestone_attnum
  from pg_attribute
  where attrelid = 'public.submissions'::regclass
    and attname = 'milestone_id'
    and not attisdropped;

  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.submissions'::regclass
      and contype = 'f'
      and (
        conkey = array[assignment_attnum]::smallint[]
        or conkey = array[milestone_attnum]::smallint[]
      )
  loop
    execute format('alter table public.submissions drop constraint %I', constraint_row.conname);
  end loop;

  alter table public.submissions
    add constraint submissions_assignment_id_fkey
      foreign key (assignment_id) references public.project_assignments(id) on delete set null,
    add constraint submissions_milestone_id_fkey
      foreign key (milestone_id) references public.project_milestones(id) on delete set null;
end
$$;

create index if not exists project_assignments_student_started_idx
  on public.project_assignments(student_user_id, started_at desc);
create index if not exists project_assignments_company_status_idx
  on public.project_assignments(company_user_id, status);
create index if not exists project_assignment_milestones_assignment_status_idx
  on public.project_assignment_milestones(assignment_id, status);
create index if not exists project_assignment_milestones_submission_idx
  on public.project_assignment_milestones(submission_id)
  where submission_id is not null;
create index if not exists submissions_assignment_milestone_history_idx
  on public.submissions(assignment_id, milestone_id, created_at desc);

-- Backfill milestone state from structured submission history. Legacy progress
-- rows remain untouched and are not treated as evidence or company approval.
insert into public.project_assignment_milestones (
  assignment_id, milestone_id, status, submission_id, feedback,
  started_at, submitted_at, reviewed_at, completed_at, created_at, updated_at
)
select
  a.id,
  m.id,
  case
    when latest.company_decision = 'approved' then 'approved'
    when latest.company_decision = 'revision_requested' then 'revision_requested'
    when latest.id is not null and p.project_source = 'practice' then 'completed'
    when latest.id is not null then 'submitted'
    else 'in_progress'
  end,
  latest.id,
  latest.company_feedback,
  a.started_at,
  latest.created_at,
  latest.reviewed_at,
  case
    when latest.company_decision = 'approved' then coalesce(latest.reviewed_at, latest.created_at)
    when latest.id is not null and p.project_source = 'practice' then latest.created_at
    else null
  end,
  coalesce(a.created_at, a.started_at),
  coalesce(a.updated_at, a.started_at)
from public.project_assignments a
join public.projects p on p.id = a.project_id
join public.project_milestones m on m.project_id = p.id
left join lateral (
  select s.id, s.company_decision, s.company_feedback, s.created_at, s.reviewed_at
  from public.submissions s
  where s.assignment_id = a.id
    and s.milestone_id = m.id
  order by s.created_at desc, s.id desc
  limit 1
) latest on true
on conflict (assignment_id, milestone_id) do nothing;

insert into public.project_milestone_progress(assignment_id, milestone_id, student_user_id, completed_at)
select a.id, m.id, a.student_user_id, null
from public.project_assignments a
join public.project_milestones m on m.project_id = a.project_id
on conflict (assignment_id, milestone_id) do nothing;

update public.project_milestone_progress old_progress
set completed_at = current_state.completed_at
from public.project_assignment_milestones current_state
where current_state.assignment_id = old_progress.assignment_id
  and current_state.milestone_id = old_progress.milestone_id
  and current_state.completed_at is not null
  and old_progress.completed_at is null;

-- A milestone's required state is controlled by publishers and cannot be
-- changed by students through the API.
create or replace function public.sync_project_milestone_sequence()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.sequence is null and new.sequence_number is not null then
      new.sequence := new.sequence_number;
    elsif new.sequence_number is null then
      new.sequence_number := new.sequence;
    elsif new.sequence is distinct from new.sequence_number then
      raise exception 'Sequence and sequence_number must match.';
    end if;
  elsif new.sequence is distinct from old.sequence
    and new.sequence_number is not distinct from old.sequence_number
  then
    new.sequence_number := new.sequence;
  elsif new.sequence_number is distinct from old.sequence_number
    and new.sequence is not distinct from old.sequence
  then
    new.sequence := new.sequence_number;
  elsif new.sequence is distinct from new.sequence_number then
    raise exception 'Sequence and sequence_number must match.';
  end if;

  if new.sequence is null or new.sequence < 1 then
    raise exception 'Milestone sequence must be a positive integer.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_project_milestone_sequence_trigger on public.project_milestones;
create trigger sync_project_milestone_sequence_trigger
before insert or update of sequence, sequence_number on public.project_milestones
for each row execute function public.sync_project_milestone_sequence();

create or replace function public.derive_project_assignment_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_row public.projects;
  company_row public.companies;
begin
  if auth.uid() is null
    or new.student_user_id is distinct from auth.uid()
    or public.current_user_role() <> 'student'::public.app_role
  then
    raise exception 'Only the authenticated student can start their own project assignment.';
  end if;

  select * into project_row
  from public.projects p
  where p.id = new.project_id
    and p.status = 'published';
  if project_row.id is null then
    raise exception 'Only published projects can be assigned.';
  end if;

  if project_row.project_source = 'company' and project_row.is_industry then
    select * into company_row
    from public.companies c
    where c.owner_user_id = project_row.company_user_id
      and c.verified = true
      and (project_row.company_id is null or c.id = project_row.company_id);
    if company_row.id is null then
      raise exception 'A verified company must own the published project.';
    end if;
    new.company_id := company_row.id;
    new.company_user_id := company_row.owner_user_id;
  elsif project_row.project_source = 'practice' and not project_row.is_industry
    and project_row.published_by is not null
  then
    new.company_id := null;
    new.company_user_id := null;
  else
    raise exception 'This project source is not eligible for student assignments.';
  end if;

  new.assigned_by := auth.uid();
  new.status := 'active';
  new.started_at := coalesce(new.started_at, now());
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.derive_project_assignment_company() from public, anon, authenticated;
drop trigger if exists derive_project_assignment_company_trigger on public.project_assignments;
create trigger derive_project_assignment_company_trigger
before insert on public.project_assignments
for each row execute function public.derive_project_assignment_company();

create or replace function public.create_assignment_milestone_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.project_assignment_milestones (
    assignment_id, milestone_id, status, started_at
  )
  select new.id, m.id, 'in_progress', now()
  from public.project_milestones m
  where m.project_id = new.project_id
  on conflict (assignment_id, milestone_id) do nothing;

  insert into public.project_milestone_progress (
    assignment_id, milestone_id, student_user_id, completed_at
  )
  select new.id, m.id, new.student_user_id, null
  from public.project_milestones m
  where m.project_id = new.project_id
  on conflict (assignment_id, milestone_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_assignment_milestone_progress() from public, anon, authenticated;
drop trigger if exists create_assignment_milestone_progress_trigger on public.project_assignments;
create trigger create_assignment_milestone_progress_trigger
after insert on public.project_assignments
for each row execute function public.create_assignment_milestone_progress();

create or replace function public.create_progress_for_added_milestone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.project_assignment_milestones (
    assignment_id, milestone_id, status, started_at
  )
  select a.id, new.id, 'in_progress', now()
  from public.project_assignments a
  where a.project_id = new.project_id
  on conflict (assignment_id, milestone_id) do nothing;

  insert into public.project_milestone_progress (
    assignment_id, milestone_id, student_user_id, completed_at
  )
  select a.id, new.id, a.student_user_id, null
  from public.project_assignments a
  where a.project_id = new.project_id
  on conflict (assignment_id, milestone_id) do nothing;

  return new;
end;
$$;

revoke all on function public.create_progress_for_added_milestone() from public, anon, authenticated;
drop trigger if exists create_progress_for_added_milestone_trigger on public.project_milestones;
create trigger create_progress_for_added_milestone_trigger
after insert on public.project_milestones
for each row execute function public.create_progress_for_added_milestone();

create or replace function public.protect_assigned_project_brief()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.project_assignments a where a.project_id = old.id)
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

create or replace function public.protect_assigned_project_milestones()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_uuid uuid;
begin
  project_uuid := case when tg_op = 'DELETE' then old.project_id else new.project_id end;

  if not exists (
    select 1 from public.project_assignments a where a.project_id = project_uuid
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'Existing milestones cannot be changed after students start assignments; append a new milestone instead.';
  end if;

  if exists (
    select 1
    from public.project_assignments a
    where a.project_id = project_uuid
      and a.status in ('approved', 'completed')
  ) then
    raise exception 'Milestones cannot be appended after a student assignment has been completed.';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = project_uuid
      and (
        (
          p.project_source = 'company'
          and p.company_user_id = auth.uid()
          and exists (
            select 1 from public.companies c
            where c.id = p.company_id
              and c.owner_user_id = auth.uid()
              and c.verified = true
          )
        )
        or (
          p.project_source = 'practice'
          and public.is_platform_admin()
        )
      )
  ) then
    raise exception 'Only the verified assigning company or platform admin can append milestones.';
  end if;

  if new.sequence <= (
    select coalesce(max(m.sequence), 0)
    from public.project_milestones m
    where m.project_id = project_uuid
  ) then
    raise exception 'New milestones must be appended after the existing sequence.';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_assigned_project_milestones() from public, anon, authenticated;
drop trigger if exists protect_assigned_project_milestones_trigger on public.project_milestones;
create trigger protect_assigned_project_milestones_trigger
before insert or update or delete on public.project_milestones
for each row execute function public.protect_assigned_project_milestones();

alter table public.project_assignment_milestones enable row level security;
drop policy if exists "assignment participants read milestone state" on public.project_assignment_milestones;
create policy "assignment participants read milestone state"
  on public.project_assignment_milestones for select to authenticated
  using (
    exists (
      select 1 from public.project_assignments a
      where a.id = assignment_id and a.student_user_id = auth.uid()
    )
    or public.is_platform_admin()
    or exists (
      select 1
      from public.project_assignments a
      join public.projects p on p.id = a.project_id
      join public.companies c on c.id = a.company_id and c.verified = true
      where a.id = assignment_id
        and a.company_user_id = auth.uid()
        and p.project_source = 'company'
    )
  );

revoke all on public.project_assignment_milestones from anon, authenticated;
grant select on public.project_assignment_milestones to authenticated;

-- Remove the old client-writable completion path. Milestone state is advanced
-- only by evidence submissions and company review triggers.
drop policy if exists "students update own milestone progress" on public.project_milestone_progress;
revoke update on public.project_milestone_progress from authenticated;

-- Create a new submission row for every attempt; review updates are accepted
-- only from the verified company that owns the current assignment.
create or replace function public.validate_assignment_submission()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  assignment_row public.project_assignments;
  milestone_row public.project_milestones;
  progress_row public.project_assignment_milestones;
  project_row public.projects;
  storage_path text;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null
      or new.student_user_id is distinct from auth.uid()
      or public.current_user_role() <> 'student'::public.app_role
      or new.assignment_id is null
      or new.milestone_id is null
      or new.status <> 'submitted'
      or new.company_decision is not null
      or new.reviewed_by is not null
      or new.reviewed_at is not null
    then
      raise exception 'Evidence must be submitted by the assigned student for a specific milestone.';
    end if;

    select * into assignment_row
    from public.project_assignments a
    where a.id = new.assignment_id
      and a.project_id = new.project_id
      and a.student_user_id = new.student_user_id
      and a.status in ('active', 'submitted', 'revision_requested');
    if assignment_row.id is null then
      raise exception 'The assignment must belong to this student and project and remain active.';
    end if;

    select * into milestone_row
    from public.project_milestones m
    where m.id = new.milestone_id
      and m.project_id = new.project_id;
    if milestone_row.id is null then
      raise exception 'The milestone must belong to the assigned project.';
    end if;

    select * into progress_row
    from public.project_assignment_milestones pm
    where pm.assignment_id = new.assignment_id
      and pm.milestone_id = new.milestone_id;
    if progress_row.id is null
      or progress_row.status not in ('in_progress', 'revision_requested')
    then
      raise exception 'This milestone is not currently accepting evidence.';
    end if;

    storage_path := new.evidence->>'storagePath';
    if storage_path is null
      or storage_path not like (new.student_user_id::text || '/' || new.project_id::text || '/%')
      or position('..' in storage_path) > 0
      or not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'project-evidence'
          and o.name = storage_path
          and (storage.foldername(o.name))[1] = new.student_user_id::text
          and (storage.foldername(o.name))[2] = new.project_id::text
      )
    then
      raise exception 'Uploaded evidence must exist in the assigned student’s private project folder.';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.student_user_id is distinct from old.student_user_id
    or new.assignment_id is distinct from old.assignment_id
    or new.milestone_id is distinct from old.milestone_id
    or new.evidence is distinct from old.evidence
    or new.reflection is distinct from old.reflection
    or new.ai_score is distinct from old.ai_score
    or new.ai_feedback is distinct from old.ai_feedback
  then
    raise exception 'Submitted evidence and assignment identity are immutable; create a new submission for revisions.';
  end if;

  if auth.uid() is null
    or public.current_user_role() <> 'company_member'::public.app_role
    or new.reviewed_by is distinct from auth.uid()
    or new.company_decision is null
    or new.company_decision not in ('approved', 'revision_requested')
    or new.status is distinct from new.company_decision
    or new.reviewed_at is null
    or old.company_decision is not null
  then
    raise exception 'Only the assigning verified company can approve a submission or request a revision.';
  end if;

  select * into assignment_row
  from public.project_assignments a
  where a.id = new.assignment_id
    and a.project_id = new.project_id
    and a.student_user_id = new.student_user_id
    and a.company_user_id = auth.uid();
  select * into project_row
  from public.projects p
  where p.id = new.project_id
    and p.project_source = 'company'
    and p.is_industry = true
    and p.company_user_id = auth.uid();

  if assignment_row.id is null
    or project_row.id is null
    or not exists (
      select 1 from public.companies c
      where c.id = assignment_row.company_id
        and c.owner_user_id = auth.uid()
        and c.verified = true
    )
    or not exists (
      select 1 from public.project_assignment_milestones pm
      where pm.assignment_id = new.assignment_id
        and pm.milestone_id = new.milestone_id
        and pm.submission_id = old.id
        and pm.status = 'submitted'
    )
  then
    raise exception 'Review is limited to the verified assigning company and the current milestone submission.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_assignment_submission() from public, anon, authenticated;
drop trigger if exists validate_assignment_submission_trigger on public.submissions;
create trigger validate_assignment_submission_trigger
before insert or update of company_decision on public.submissions
for each row execute function public.validate_assignment_submission();

-- Keep the existing trigger name so this synchronization runs before the
-- certificate_after_company_approval trigger installed by the certificate SQL.
create or replace function public.update_assignment_from_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_name text;
  all_required_complete boolean;
begin
  select p.project_source into source_name
  from public.projects p
  where p.id = new.project_id;

  if tg_op = 'INSERT' then
    update public.project_assignment_milestones
    set submission_id = new.id,
        status = case when source_name = 'practice' then 'completed' else 'submitted' end,
        feedback = null,
        submitted_at = new.created_at,
        reviewed_at = null,
        completed_at = case when source_name = 'practice' then new.created_at else null end,
        updated_at = now()
    where assignment_id = new.assignment_id
      and milestone_id = new.milestone_id;

    update public.project_milestone_progress
    set completed_at = case when source_name = 'practice' then new.created_at else null end
    where assignment_id = new.assignment_id
      and milestone_id = new.milestone_id;

    select coalesce(bool_and(pm.status in ('completed', 'approved')), false)
      and count(*) > 0
    into all_required_complete
    from public.project_assignment_milestones pm
    join public.project_milestones m on m.id = pm.milestone_id
    where pm.assignment_id = new.assignment_id and m.is_required;

    update public.project_assignments
    set submitted_at = coalesce(submitted_at, new.created_at),
        status = case
          when source_name = 'practice' and all_required_complete then 'completed'
          when source_name = 'practice' then 'active'
          else 'submitted'
        end,
        completed_at = case
          when source_name = 'practice' and all_required_complete then coalesce(completed_at, new.created_at)
          else completed_at
        end,
        updated_at = now()
    where id = new.assignment_id;
    return new;
  end if;

  update public.project_assignment_milestones
  set status = case
        when new.company_decision = 'approved' then 'approved'
        else 'revision_requested'
      end,
      feedback = new.company_feedback,
      reviewed_at = new.reviewed_at,
      completed_at = case when new.company_decision = 'approved' then coalesce(new.reviewed_at, now()) else null end,
      updated_at = now()
  where assignment_id = new.assignment_id
    and milestone_id = new.milestone_id
    and submission_id = new.id;

  update public.project_milestone_progress
  set completed_at = case when new.company_decision = 'approved' then coalesce(new.reviewed_at, now()) else null end
  where assignment_id = new.assignment_id
    and milestone_id = new.milestone_id;

  select coalesce(bool_and(pm.status = 'approved'), false)
    and count(*) > 0
  into all_required_complete
  from public.project_assignment_milestones pm
  join public.project_milestones m on m.id = pm.milestone_id
  where pm.assignment_id = new.assignment_id and m.is_required;

  update public.project_assignments
  set status = case
        when new.company_decision = 'revision_requested' then 'revision_requested'
        when all_required_complete then 'approved'
        else 'active'
      end,
      completed_at = case
        when new.company_decision = 'approved' and all_required_complete then coalesce(completed_at, new.reviewed_at, now())
        when new.company_decision = 'revision_requested' then null
        else completed_at
      end,
      updated_at = now()
  where id = new.assignment_id;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (
    auth.uid(),
    case when new.company_decision = 'approved' then 'submission_approved' else 'submission_revision_requested' end,
    'submission',
    new.id,
    jsonb_build_object('assignment_id', new.assignment_id, 'milestone_id', new.milestone_id)
  );
  return new;
end;
$$;

revoke all on function public.update_assignment_from_submission() from public, anon, authenticated;
drop trigger if exists assignment_status_after_submission on public.submissions;
create trigger assignment_status_after_submission
after insert or update of company_decision on public.submissions
for each row execute function public.update_assignment_from_submission();

-- Correct legacy rows from the earlier certificate migration without
-- relabeling them as company-issued. No issuer or signatory is fabricated.
alter table public.certificates
  add column if not exists certificate_code text,
  add column if not exists issuer_name text,
  add column if not exists signatory_name text,
  add column if not exists signatory_title text,
  add column if not exists certificate_status text not null default 'issued',
  add column if not exists certificate_pdf_path text,
  add column if not exists assignment_id uuid references public.project_assignments(id) on delete set null,
  add column if not exists recipient_name text,
  add column if not exists project_title text,
  add column if not exists project_description text,
  add column if not exists pathway_name text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text;

alter table public.certificates
  alter column issuer_name drop not null,
  alter column issuer_name drop default,
  alter column project_id drop not null,
  alter column submission_id drop not null,
  alter column certificate_type set default 'project_learning',
  alter column certificate_code
    set default ('BB-' || upper(encode(gen_random_bytes(8), 'hex')));

alter table public.certificates drop constraint if exists certificates_certificate_type_check;
alter table public.certificates drop constraint if exists certificates_certificate_status_check;
alter table public.certificates drop constraint if exists certificates_certificate_code_check;
update public.certificates
set certificate_type = 'legacy_unverified',
    certificate_status = 'revoked',
    certificate_code = null,
    issuer_name = null,
    signatory_name = null,
    signatory_title = null,
    revoked_at = coalesce(revoked_at, now()),
    revocation_reason = coalesce(
      revocation_reason,
      'This credential predates the required company approval and issuer authorization.'
    )
where certificate_type = 'industry_completion'
   or (
     certificate_type = 'company_project_completion'
     and certificate_status = 'revoked'
     and revocation_reason = 'This record predates complete-project approval and explicit issuer authorization.'
   )
   or (
     certificate_type = 'company_project_completion'
     and not exists (
       select 1
       from public.project_assignments a
       join public.projects p on p.id = a.project_id
       join public.companies c
         on c.id = a.company_id and c.owner_user_id = p.company_user_id and c.verified
       join public.company_certificate_signatories s
         on s.company_id = c.id
        and s.company_user_id = c.owner_user_id
        and s.authorized_by = c.owner_user_id
       join public.submissions issued_submission
         on issued_submission.id = certificates.submission_id
        and issued_submission.assignment_id = a.id
        and issued_submission.project_id = p.id
        and issued_submission.student_user_id = a.student_user_id
        and issued_submission.company_decision = 'approved'
        and issued_submission.reviewed_by = c.owner_user_id
       where a.id = certificates.assignment_id
         and a.project_id = certificates.project_id
         and a.student_user_id = certificates.student_user_id
         and p.project_source = 'company'
         and p.is_industry
         and certificates.issuer_name = c.name
         and certificates.signatory_name = s.signatory_name
         and certificates.signatory_title = s.signatory_title
         and exists (
           select 1 from public.project_milestones m
           where m.project_id = p.id and m.is_required
         )
         and not exists (
           select 1
           from public.project_milestones m
           left join public.project_assignment_milestones pm
             on pm.assignment_id = a.id and pm.milestone_id = m.id
           left join public.submissions approved
             on approved.id = pm.submission_id
            and approved.assignment_id = a.id
            and approved.milestone_id = m.id
            and approved.company_decision = 'approved'
            and approved.reviewed_by = c.owner_user_id
           where m.project_id = p.id
             and m.is_required
             and (pm.status is distinct from 'approved' or approved.id is null)
         )
     )
   )
   or (
     certificate_type in ('project_learning', 'skill_demonstration')
     and not exists (
       select 1
       from public.project_assignments a
       join public.projects p on p.id = a.project_id
       join public.submissions issued_submission
         on issued_submission.id = certificates.submission_id
        and issued_submission.assignment_id = a.id
        and issued_submission.project_id = p.id
        and issued_submission.student_user_id = a.student_user_id
        and nullif(issued_submission.evidence->>'storagePath', '') is not null
       where a.id = certificates.assignment_id
         and a.project_id = certificates.project_id
         and a.student_user_id = certificates.student_user_id
         and a.status = 'completed'
         and p.project_source = 'practice'
         and not p.is_industry
         and certificates.issuer_name = 'BuildBridge'
         and exists (
           select 1 from public.project_milestones m
           where m.project_id = p.id and m.is_required
         )
         and not exists (
           select 1
           from public.project_milestones m
           left join public.project_assignment_milestones pm
             on pm.assignment_id = a.id and pm.milestone_id = m.id
           left join public.submissions evidence
             on evidence.id = pm.submission_id
            and evidence.assignment_id = a.id
            and evidence.milestone_id = m.id
            and nullif(evidence.evidence->>'storagePath', '') is not null
           where m.project_id = p.id
             and m.is_required
             and (pm.status is distinct from 'completed' or evidence.id is null)
         )
     )
   );

alter table public.certificates
  add constraint certificates_certificate_type_check
    check (certificate_type in (
      'project_learning',
      'skill_demonstration',
      'company_project_completion',
      'learning_pathway_completion',
      'legacy_unverified'
    )),
  add constraint certificates_certificate_status_check
    check (certificate_status in ('issued', 'revoked')),
  add constraint certificates_certificate_code_check
    check (certificate_code is null or certificate_code ~ '^BB-[A-F0-9]{16}$');

create unique index if not exists certificates_certificate_code_unique
  on public.certificates(certificate_code)
  where certificate_code is not null;
alter table public.certificates drop constraint if exists certificates_submission_id_key;
create unique index if not exists certificates_submission_type_unique
  on public.certificates(submission_id, certificate_type)
  where submission_id is not null;
create unique index if not exists certificates_assignment_type_unique
  on public.certificates(assignment_id, certificate_type)
  where assignment_id is not null;

-- Do not allow direct student writes to completion state. Certificate issuing
-- functions below use the assignment-milestone table as the approval source.

create or replace function public.has_all_required_milestones(
  assignment_uuid uuid,
  required_status text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.project_assignments a
      join public.project_milestones m on m.project_id = a.project_id and m.is_required
      where a.id = assignment_uuid
    )
    and not exists (
      select 1
      from public.project_assignments a
      join public.project_milestones m on m.project_id = a.project_id and m.is_required
      left join public.project_assignment_milestones pm
        on pm.assignment_id = a.id and pm.milestone_id = m.id
      where a.id = assignment_uuid
        and pm.status is distinct from required_status
    )
$$;
revoke all on function public.has_all_required_milestones(uuid, text) from public, anon, authenticated;

create or replace function public.validate_certificate_issue()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_row public.projects;
  company_row public.companies;
  signatory_row public.company_certificate_signatories;
  profile_name text;
  roadmap_steps jsonb;
  roadmap_step jsonb;
  topic_name text;
  required_skill text;
  step_complete boolean;
begin
  if new.certificate_code is null
    or new.certificate_code !~ '^BB-[A-F0-9]{16}$'
    or new.certificate_status <> 'issued'
    or nullif(trim(new.recipient_name), '') is null
  then
    raise exception 'Certificate ID, status, and recipient name must be issued by the authorized workflow.';
  end if;

  select p.full_name into profile_name
  from public.profiles p
  where p.id = new.student_user_id and p.role = 'student'::public.app_role;
  if profile_name is null or trim(profile_name) <> trim(new.recipient_name) then
    raise exception 'The certificate recipient must match the student profile name.';
  end if;

  if new.certificate_type = 'learning_pathway_completion' then
    if not public.is_platform_admin()
      or new.issuer_name is distinct from 'BuildBridge'
      or new.project_id is not null
      or new.assignment_id is not null
      or new.submission_id is not null
      or new.project_title is not null
      or new.project_description is not null
      or nullif(trim(new.pathway_name), '') is null
      or new.signatory_name is not null
      or new.signatory_title is not null
    then
      raise exception 'Learning pathway certificates require an administrator-approved saved pathway.';
    end if;

    select r.steps into roadmap_steps
    from public.student_roadmaps r
    where r.student_user_id = new.student_user_id
      and r.career_goal = new.pathway_name;
    if roadmap_steps is null or jsonb_typeof(roadmap_steps) <> 'array' or jsonb_array_length(roadmap_steps) = 0 then
      raise exception 'A saved learning pathway is required for this certificate.';
    end if;

    for roadmap_step in select value from jsonb_array_elements(roadmap_steps)
    loop
      topic_name := lower(coalesce(roadmap_step->'learningTopics'->>0, roadmap_step->'requiredSkills'->>0, ''));
      step_complete := topic_name <> '' and exists (
        select 1 from public.learning_activity a
        where a.student_user_id = new.student_user_id
          and a.action = 'completed'
          and lower(trim(a.topic)) = topic_name
      );
      if not step_complete and jsonb_typeof(roadmap_step->'requiredSkills') = 'array' then
        for required_skill in
          select value from jsonb_array_elements_text(roadmap_step->'requiredSkills')
        loop
          if exists (
            select 1 from public.skill_evidence e
            where e.student_user_id = new.student_user_id
              and lower(trim(e.skill)) = lower(trim(required_skill))
              and e.status in ('demonstrated', 'company_verified')
          ) then
            step_complete := true;
            exit;
          end if;
        end loop;
      end if;
      if not step_complete then
        raise exception 'Every pathway step needs recorded completion or demonstrated-skill evidence.';
      end if;
    end loop;

    if exists (
      select 1 from unnest(coalesce(new.skills, '{}'::text[])) certificate_skill
      where not exists (
        select 1 from public.skill_evidence e
        where e.student_user_id = new.student_user_id
          and lower(trim(e.skill)) = lower(trim(certificate_skill))
          and e.status in ('demonstrated', 'company_verified')
      )
    ) or exists (
      select 1 from unnest(coalesce(new.skills, '{}'::text[])) certificate_skill
      where not exists (
        select 1
        from jsonb_array_elements(roadmap_steps) step
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(step->'requiredSkills') = 'array' then step->'requiredSkills'
            else '[]'::jsonb
          end
        ) required(skill)
        where lower(trim(required.skill)) = lower(trim(certificate_skill))
      )
    ) then
      raise exception 'Pathway certificate skills must be evidenced skills included in the saved pathway.';
    end if;
    return new;
  end if;

  select * into project_row from public.projects where id = new.project_id;
  if project_row.id is null
    or new.project_title is distinct from project_row.title
    or new.project_description is distinct from left(coalesce(project_row.scope, ''), 600)
  then
    raise exception 'Project certificate details must match the recorded project.';
  end if;

  if new.certificate_type = 'company_project_completion' then
    if project_row.project_source <> 'company'
      or not project_row.is_industry
      or new.assignment_id is null
      or new.submission_id is null
      or new.pathway_name is not null
    then
      raise exception 'Company completion certificates require an assigned industry project.';
    end if;

    select c.* into company_row
    from public.companies c
    where c.owner_user_id = project_row.company_user_id and c.verified;
    select s.* into signatory_row
    from public.company_certificate_signatories s
    where s.company_id = company_row.id
      and s.company_user_id = project_row.company_user_id
      and s.authorized_by = project_row.company_user_id;

    if company_row.id is null
      or signatory_row.id is null
      or new.issuer_name is distinct from company_row.name
      or new.signatory_name is distinct from signatory_row.signatory_name
      or new.signatory_title is distinct from signatory_row.signatory_title
    then
      raise exception 'A verified company and its explicitly authorized signatory must match the certificate.';
    end if;

    if not exists (
      select 1 from public.project_assignments a
      where a.id = new.assignment_id
        and a.project_id = new.project_id
        and a.student_user_id = new.student_user_id
        and a.company_user_id = project_row.company_user_id
    ) or not exists (
      select 1 from public.submissions s
      where s.id = new.submission_id
        and s.assignment_id = new.assignment_id
        and s.project_id = new.project_id
        and s.student_user_id = new.student_user_id
        and s.company_decision = 'approved'
        and s.reviewed_by = project_row.company_user_id
    ) or not public.has_all_required_milestones(new.assignment_id, 'approved')
    then
      raise exception 'Every required milestone must be approved by the verified assigning company.';
    end if;
  else
    if not public.is_platform_admin()
      or new.certificate_type not in ('project_learning', 'skill_demonstration')
      or new.issuer_name is distinct from 'BuildBridge'
      or project_row.project_source <> 'practice'
      or project_row.is_industry
      or new.assignment_id is null
      or new.submission_id is null
      or new.pathway_name is not null
      or new.signatory_name is not null
      or new.signatory_title is not null
    then
      raise exception 'Platform project certificates require an administrator-reviewed project assignment.';
    end if;

    if not exists (
      select 1 from public.project_assignments a
      where a.id = new.assignment_id
        and a.project_id = new.project_id
        and a.student_user_id = new.student_user_id
    ) or not exists (
      select 1 from public.submissions s
      where s.id = new.submission_id
        and s.assignment_id = new.assignment_id
        and s.project_id = new.project_id
        and s.student_user_id = new.student_user_id
        and s.milestone_id is not null
        and nullif(s.evidence->>'storagePath', '') is not null
    ) or (
      not public.has_all_required_milestones(new.assignment_id, 'completed')
      and not public.has_all_required_milestones(new.assignment_id, 'approved')
    )
      or exists (
        select 1
        from public.project_assignments a
        join public.project_milestones m on m.project_id = a.project_id and m.is_required
        left join public.project_assignment_milestones pm
          on pm.assignment_id = a.id and pm.milestone_id = m.id
        left join public.submissions s
          on s.id = pm.submission_id
          and s.assignment_id = a.id
          and s.milestone_id = m.id
          and nullif(s.evidence->>'storagePath', '') is not null
        where a.id = new.assignment_id and s.id is null
      )
    then
      raise exception 'Every required project milestone needs recorded evidence before platform issuance.';
    end if;

    if exists (
      select 1 from unnest(coalesce(new.skills, '{}'::text[])) certificate_skill
      where not exists (
        select 1 from public.skill_evidence e
        where e.student_user_id = new.student_user_id
          and e.source_id = new.project_id
          and lower(trim(e.skill)) = lower(trim(certificate_skill))
          and e.skill = any(project_row.required_skills)
          and e.status in ('demonstrated', 'company_verified')
      )
    ) then
      raise exception 'Certificate skills must match demonstrated evidence linked to this project.';
    end if;
    if new.certificate_type = 'skill_demonstration' and cardinality(new.skills) = 0 then
      raise exception 'A skill demonstration certificate must include at least one evidenced skill.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_certificate_issue_trigger on public.certificates;
create trigger validate_certificate_issue_trigger
before insert on public.certificates
for each row execute function public.validate_certificate_issue();

create or replace function public.issue_industry_certificate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_row public.projects;
  company_row public.companies;
  signatory_row public.company_certificate_signatories;
  recipient_full_name text;
  approved_skills text[];
begin
  if new.company_decision <> 'approved'
    or old.company_decision is not distinct from 'approved'
    or new.assignment_id is null
    or not public.has_all_required_milestones(new.assignment_id, 'approved')
  then
    return new;
  end if;

  select * into project_row
  from public.projects p
  where p.id = new.project_id
    and p.project_source = 'company'
    and p.is_industry = true
    and p.company_user_id = new.reviewed_by;

  select c.* into company_row
  from public.companies c
  where c.owner_user_id = project_row.company_user_id
    and c.verified = true;

  select s.* into signatory_row
  from public.company_certificate_signatories s
  where s.company_id = company_row.id
    and s.company_user_id = project_row.company_user_id
    and s.authorized_by = project_row.company_user_id;

  if project_row.id is null or company_row.id is null or signatory_row.id is null then
    return new;
  end if;

  select p.full_name into recipient_full_name
  from public.profiles p
  where p.id = new.student_user_id and p.role = 'student'::public.app_role;
  if nullif(trim(recipient_full_name), '') is null then
    return new;
  end if;

  select coalesce(array_agg(distinct e.skill), '{}'::text[]) into approved_skills
  from public.skill_evidence e
  where e.student_user_id = new.student_user_id
    and e.source_id = new.project_id
    and e.skill = any(project_row.required_skills)
    and e.status in ('demonstrated', 'company_verified');

  insert into public.certificates (
    student_user_id, project_id, submission_id, assignment_id, certificate_type,
    recipient_name, project_title, project_description, skills, issuer_name,
    signatory_name, signatory_title
  )
  values (
    new.student_user_id, new.project_id, new.id, new.assignment_id, 'company_project_completion',
    recipient_full_name, project_row.title, left(coalesce(project_row.scope, ''), 600),
    approved_skills, company_row.name, signatory_row.signatory_name, signatory_row.signatory_title
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists certificate_after_company_approval on public.submissions;
create trigger certificate_after_company_approval
after update of company_decision on public.submissions
for each row execute function public.issue_industry_certificate();

create or replace function public.verify_certificate(certificate_code_input text)
returns table (
  certificate_code text,
  certificate_type text,
  recipient_name text,
  project_title text,
  project_description text,
  pathway_name text,
  skills text[],
  issuer_name text,
  signatory_name text,
  signatory_title text,
  issued_at timestamptz,
  certificate_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.certificate_code, c.certificate_type, c.recipient_name,
         c.project_title, c.project_description, c.pathway_name, c.skills,
         c.issuer_name, c.signatory_name, c.signatory_title, c.issued_at,
         c.certificate_status
  from public.certificates c
  where c.certificate_code = upper(certificate_code_input)
    and c.certificate_code is not null
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.project_assignment_milestones to authenticated;
grant insert (project_id, student_user_id) on public.project_assignments to authenticated;
revoke update on public.project_assignments from authenticated;
revoke insert, update, delete on public.project_assignment_milestones from anon, authenticated;

notify pgrst, 'reload schema';
commit;
