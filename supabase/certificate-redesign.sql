-- Evidence-backed certificate records, explicit issuer authorization, and
-- privacy-limited public verification. Run after the base schema, auth repair,
-- learning-ai.sql, and project-marketplace.sql.

alter table public.certificates
  add column if not exists certificate_code text,
  add column if not exists assignment_id uuid references public.project_assignments(id) on delete set null,
  add column if not exists recipient_name text,
  add column if not exists project_title text,
  add column if not exists project_description text,
  add column if not exists pathway_name text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists issuer_name text not null default 'BuildBridge',
  add column if not exists signatory_name text,
  add column if not exists signatory_title text,
  add column if not exists certificate_status text not null default 'issued',
  add column if not exists revoked_at timestamptz,
  add column if not exists revocation_reason text;

alter table public.certificates alter column project_id drop not null;
alter table public.certificates alter column submission_id drop not null;
alter table public.certificates alter column certificate_type set default 'project_learning';

update public.certificates c
set recipient_name = p.full_name
from public.profiles p
where c.student_user_id = p.id and c.recipient_name is null;

update public.certificates c
set project_title = p.title,
    project_description = left(coalesce(p.scope, ''), 600)
from public.projects p
where c.project_id = p.id and c.project_title is null;

update public.certificates
set certificate_type = 'company_project_completion',
    certificate_status = 'revoked',
    certificate_code = null,
    revoked_at = coalesce(revoked_at, now()),
    revocation_reason = coalesce(
      revocation_reason,
      'This record predates complete-project approval and explicit issuer authorization.'
    )
where certificate_type = 'industry_completion';

alter table public.certificates alter column certificate_code
  set default ('BB-' || upper(encode(gen_random_bytes(8), 'hex')));

alter table public.certificates drop constraint if exists certificates_submission_id_key;
alter table public.certificates drop constraint if exists certificates_certificate_type_check;
alter table public.certificates drop constraint if exists certificates_certificate_status_check;
alter table public.certificates drop constraint if exists certificates_certificate_code_check;
alter table public.certificates add constraint certificates_certificate_type_check
  check (certificate_type in (
    'project_learning',
    'skill_demonstration',
    'company_project_completion',
    'learning_pathway_completion'
  ));
alter table public.certificates add constraint certificates_certificate_status_check
  check (certificate_status in ('issued', 'revoked'));
alter table public.certificates add constraint certificates_certificate_code_check
  check (certificate_code is null or certificate_code ~ '^BB-[A-F0-9]{16}$');

create unique index if not exists certificates_certificate_code_unique
  on public.certificates(certificate_code) where certificate_code is not null;
create unique index if not exists certificates_submission_type_unique
  on public.certificates(submission_id, certificate_type)
  where submission_id is not null;
create unique index if not exists certificates_assignment_type_unique
  on public.certificates(assignment_id, certificate_type)
  where assignment_id is not null;
create unique index if not exists certificates_pathway_type_unique
  on public.certificates(student_user_id, certificate_type, pathway_name)
  where certificate_type = 'learning_pathway_completion' and pathway_name is not null;

create table if not exists public.company_certificate_signatories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  company_user_id uuid not null references public.profiles(id) on delete cascade,
  signatory_name text not null check (length(trim(signatory_name)) between 2 and 120),
  signatory_title text not null check (length(trim(signatory_title)) between 2 and 120),
  authorized_by uuid not null references public.profiles(id),
  authorized_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.company_certificate_signatories enable row level security;
drop policy if exists "company owners read certificate signatory" on public.company_certificate_signatories;
drop policy if exists "verified company owners authorize certificate signatory" on public.company_certificate_signatories;
drop policy if exists "verified company owners update certificate signatory" on public.company_certificate_signatories;
drop policy if exists "verified company owners remove certificate signatory" on public.company_certificate_signatories;
create policy "company owners read certificate signatory"
  on public.company_certificate_signatories for select to authenticated
  using (company_user_id = auth.uid() or public.is_platform_admin());
create policy "verified company owners authorize certificate signatory"
  on public.company_certificate_signatories for insert to authenticated
  with check (
    company_user_id = auth.uid()
    and authorized_by = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_user_id = auth.uid() and c.verified
    )
  );
create policy "verified company owners update certificate signatory"
  on public.company_certificate_signatories for update to authenticated
  using (company_user_id = auth.uid())
  with check (
    company_user_id = auth.uid()
    and authorized_by = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = company_id and c.owner_user_id = auth.uid() and c.verified
    )
  );
create policy "verified company owners remove certificate signatory"
  on public.company_certificate_signatories for delete to authenticated
  using (company_user_id = auth.uid());
grant select, insert, update, delete on public.company_certificate_signatories to authenticated;

alter table public.certificates enable row level security;
drop policy if exists "certificates visible to owner and admin" on public.certificates;
drop policy if exists "admin issues platform certificates" on public.certificates;
drop policy if exists "admin revokes certificates" on public.certificates;
create policy "certificates visible to owner and admin"
  on public.certificates for select to authenticated
  using (student_user_id = auth.uid() or public.is_platform_admin());
create policy "admin issues platform certificates"
  on public.certificates for insert to authenticated
  with check (
    public.is_platform_admin()
    and certificate_type in ('project_learning', 'skill_demonstration', 'learning_pathway_completion')
    and issuer_name = 'BuildBridge'
    and certificate_status = 'issued'
    and recipient_name is not null
  );
create policy "admin revokes certificates"
  on public.certificates for update to authenticated
  using (public.is_platform_admin() and certificate_status = 'issued')
  with check (public.is_platform_admin() and certificate_status = 'revoked' and revoked_at is not null);
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated;
grant insert (
  student_user_id, project_id, submission_id, assignment_id, certificate_type,
  recipient_name, project_title, project_description, pathway_name, skills,
  issuer_name, signatory_name, signatory_title
) on public.certificates to authenticated;
grant update (certificate_status, revoked_at, revocation_reason) on public.certificates to authenticated;

drop policy if exists "admins read pathway completion activity" on public.learning_activity;
create policy "admins read pathway completion activity"
  on public.learning_activity for select to authenticated
  using (public.is_platform_admin());
drop policy if exists "admins read pathway roadmaps" on public.student_roadmaps;
create policy "admins read pathway roadmaps"
  on public.student_roadmaps for select to authenticated
  using (public.is_platform_admin());

create or replace function public.validate_certificate_issue()
returns trigger
language plpgsql
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
      or new.issuer_name <> 'BuildBridge'
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
    ) then
      raise exception 'Pathway certificate skills must be backed by demonstrated-skill records.';
    end if;
    if exists (
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
      raise exception 'Pathway certificate skills must be part of the recorded pathway.';
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
      raise exception 'The verified company and its explicitly authorized signatory must match the certificate.';
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
        and s.student_user_id = new.student_user_id
        and s.company_decision = 'approved'
        and s.reviewed_by = project_row.company_user_id
    ) or not exists (
      select 1 from public.project_milestones m where m.project_id = new.project_id
    ) or exists (
      select 1 from public.project_milestones m
      where m.project_id = new.project_id
        and not exists (
          select 1 from public.submissions s
          where s.assignment_id = new.assignment_id
            and s.project_id = new.project_id
            and s.student_user_id = new.student_user_id
            and s.milestone_id = m.id
            and s.company_decision = 'approved'
            and s.reviewed_by = project_row.company_user_id
        )
    ) then
      raise exception 'Every project milestone must be approved by its assigning verified company.';
    end if;
  else
    if not public.is_platform_admin()
      or new.certificate_type not in ('project_learning', 'skill_demonstration')
      or new.issuer_name <> 'BuildBridge'
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
    ) or not exists (
      select 1 from public.project_milestones m where m.project_id = new.project_id
    ) or exists (
      select 1 from public.project_milestones m
      where m.project_id = new.project_id
        and (
          not exists (
            select 1 from public.project_milestone_progress mp
            where mp.assignment_id = new.assignment_id
              and mp.student_user_id = new.student_user_id
              and mp.milestone_id = m.id
              and mp.completed_at is not null
          )
          or not exists (
            select 1 from public.submissions s
            where s.assignment_id = new.assignment_id
              and s.student_user_id = new.student_user_id
              and s.milestone_id = m.id
              and nullif(s.evidence->>'storagePath', '') is not null
          )
        )
    ) then
      raise exception 'Every project milestone requires uploaded evidence and recorded completion.';
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
  then
    return new;
  end if;

  select * into project_row
  from public.projects
  where id = new.project_id;

  if not project_row.is_industry
    or project_row.project_source <> 'company'
    or project_row.company_user_id is distinct from new.reviewed_by
    or not exists (
      select 1 from public.companies c
      where c.owner_user_id = project_row.company_user_id and c.verified
    )
    or not exists (
      select 1 from public.project_assignments a
      where a.id = new.assignment_id
        and a.project_id = new.project_id
        and a.student_user_id = new.student_user_id
    )
    or not exists (
      select 1 from public.project_milestones m
      where m.project_id = new.project_id
    )
    or exists (
      select 1
      from public.project_milestones m
      where m.project_id = new.project_id
        and not exists (
          select 1 from public.submissions s
          where s.assignment_id = new.assignment_id
            and s.project_id = new.project_id
            and s.student_user_id = new.student_user_id
            and s.milestone_id = m.id
            and s.company_decision = 'approved'
            and s.reviewed_by = project_row.company_user_id
        )
    )
  then
    return new;
  end if;

  select c.* into company_row
  from public.companies c
  where c.owner_user_id = project_row.company_user_id and c.verified;

  select s.* into signatory_row
  from public.company_certificate_signatories s
  where s.company_id = company_row.id
    and s.company_user_id = project_row.company_user_id
    and s.authorized_by = project_row.company_user_id;

  if signatory_row.id is null then
    return new;
  end if;

  select p.full_name into recipient_full_name
  from public.profiles p
  where p.id = new.student_user_id;

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
  select
    c.certificate_code,
    c.certificate_type,
    c.recipient_name,
    c.project_title,
    c.project_description,
    c.pathway_name,
    c.skills,
    c.issuer_name,
    c.signatory_name,
    c.signatory_title,
    c.issued_at,
    c.certificate_status
  from public.certificates c
  where c.certificate_code = certificate_code_input
$$;
revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
