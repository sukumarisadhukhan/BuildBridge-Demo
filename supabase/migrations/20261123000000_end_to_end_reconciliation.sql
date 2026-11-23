begin;

-- Reconcile incomplete company registration intents without replacing existing rows.
alter table public.company_domain_requests
  alter column organization_name drop not null,
  alter column email_domain drop not null,
  alter column dns_token drop not null;

alter table public.company_domain_requests
  add column if not exists official_website text,
  add column if not exists organization_email text,
  add column if not exists business_registration text,
  add column if not exists country_of_registration text,
  add column if not exists organization_type text,
  add column if not exists description text,
  add column if not exists authorized_representative_name text,
  add column if not exists authorized_representative_title text,
  add column if not exists authorized_representative_phone text,
  add column if not exists industry text,
  add column if not exists company_size text,
  add column if not exists headquarters_address text,
  add column if not exists logo_url text,
  add column if not exists legal_name text,
  add column if not exists brand_name text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists previous_status text,
  add column if not exists submitted_document_urls text[] not null default '{}'::text[];

update public.company_domain_requests
set status = 'domain_pending'
where status = 'pending_dns';

update public.company_domain_requests
set status = 'pending_admin_review'
where status = 'pending_admin';

alter table public.company_domain_requests
  alter column status set default 'details_pending';

update public.company_domain_requests
set status = 'details_pending'
where status is null;

alter table public.company_domain_requests
  drop constraint if exists company_domain_requests_status_check;
alter table public.company_domain_requests
  add constraint company_domain_requests_status_check
  check (status in (
    'details_pending','submitted','email_pending','domain_pending',
    'pending_admin_review','additional_information_required','approved','rejected'
  ));

alter table public.company_domain_requests
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists company_domain_requests_user_unique
  on public.company_domain_requests(user_id);

alter table public.companies
  add column if not exists industry text,
  add column if not exists organization_type text,
  add column if not exists official_website text,
  add column if not exists organization_email text,
  add column if not exists description text,
  add column if not exists country_of_registration text,
  add column if not exists business_registration text,
  add column if not exists headquarters_address text,
  add column if not exists organization_contact text,
  add column if not exists authorized_representative_name text,
  add column if not exists authorized_representative_title text,
  add column if not exists authorized_representative_phone text,
  add column if not exists company_size text,
  add column if not exists logo_url text,
  add column if not exists legal_name text,
  add column if not exists brand_name text;

-- Coursework and Vault reconciliation.
alter table public.coursework_maps
  add column if not exists updated_at timestamptz not null default now();

alter table public.student_vault_artifacts
  add column if not exists source_key text;

update public.student_vault_artifacts
set source_key = case
  when evidence_id is not null then 'submission:' || evidence_id::text
  when project_id is not null and milestone_id is not null then 'project-evidence:' || project_id::text || ':' || milestone_id::text
  when metadata->>'certificate_id' is not null then 'certificate:' || metadata->>'certificate_id'
  when external_url is not null then 'external:' || md5(external_url)
  when storage_path is not null then 'file:' || md5(storage_path)
  else 'legacy-vault:' || id::text
end
where source_key is null;

create unique index if not exists student_vault_artifacts_source_unique
  on public.student_vault_artifacts(student_user_id, source_key)
  where source_key is not null;

-- Playback schema reconciliation.
alter table public.learning_playback_sessions
  add column if not exists active_filters jsonb not null default '{}'::jsonb,
  add column if not exists position_seconds numeric(12,3) not null default 0,
  add column if not exists duration_seconds numeric(12,3),
  add column if not exists completed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- Submission insert and company approval keep milestone and assignment state synchronized.
create or replace function public.synchronize_project_submission_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_record public.project_assignments%rowtype;
  incomplete_required integer;
begin
  select * into assignment_record
  from public.project_assignments
  where id = coalesce(new.assignment_id, old.assignment_id);

  if assignment_record.id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    update public.project_assignment_milestones
    set status = 'submitted',
        submission_id = new.id,
        submitted_at = now(),
        updated_at = now()
    where assignment_id = new.assignment_id
      and milestone_id = new.milestone_id;

    update public.project_assignments
    set status = 'submitted',
        submitted_at = now(),
        updated_at = now()
    where id = new.assignment_id;

    if exists (
      select 1
      from public.projects project
      where project.id = assignment_record.project_id
        and project.project_source = 'practice'
    ) then
      update public.project_assignment_milestones
      set status = 'completed',
          submission_id = new.id,
          submitted_at = now(),
          completed_at = now(),
          updated_at = now()
      where assignment_id = new.assignment_id
        and milestone_id = new.milestone_id;

      select count(*) into incomplete_required
      from public.project_milestones milestone
      left join public.project_assignment_milestones progress
        on progress.assignment_id = new.assignment_id
        and progress.milestone_id = milestone.id
      where milestone.project_id = assignment_record.project_id
        and milestone.is_required = true
        and coalesce(progress.status, 'not_started') <> 'completed';

      if incomplete_required = 0 then
        update public.project_assignments
        set status = 'completed',
            completed_at = now(),
            submitted_at = coalesce(submitted_at, now()),
            updated_at = now()
        where id = new.assignment_id;
      end if;
    end if;
  elsif new.company_decision is distinct from old.company_decision then
    if new.company_decision = 'approved' then
      update public.project_assignment_milestones
      set status = 'completed',
          submission_id = new.id,
          completed_at = now(),
          reviewed_at = now(),
          feedback = coalesce(new.company_feedback, feedback),
          updated_at = now()
      where assignment_id = new.assignment_id
        and milestone_id = new.milestone_id;
    elsif new.company_decision = 'revision_requested' then
      update public.project_assignment_milestones
      set status = 'revision_requested',
          reviewed_at = now(),
          feedback = coalesce(new.company_feedback, feedback),
          updated_at = now()
      where assignment_id = new.assignment_id
        and milestone_id = new.milestone_id;

      update public.project_assignments
      set status = 'revision_requested',
          updated_at = now()
      where id = new.assignment_id;
    end if;

    select count(*) into incomplete_required
    from public.project_milestones milestone
    left join public.project_assignment_milestones progress
      on progress.assignment_id = new.assignment_id
      and progress.milestone_id = milestone.id
    where milestone.project_id = assignment_record.project_id
      and milestone.is_required = true
      and coalesce(progress.status, 'not_started') <> 'completed';

    if new.company_decision = 'approved' and incomplete_required = 0 then
      update public.project_assignments
      set status = 'completed',
          completed_at = now(),
          updated_at = now()
      where id = new.assignment_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists synchronize_project_submission_state_insert on public.submissions;
create trigger synchronize_project_submission_state_insert
after insert on public.submissions
for each row execute function public.synchronize_project_submission_state();

drop trigger if exists synchronize_project_submission_state_update on public.submissions;
create trigger synchronize_project_submission_state_update
after update of company_decision, company_feedback on public.submissions
for each row execute function public.synchronize_project_submission_state();

create or replace function public.issue_completed_project_certificate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  project_record public.projects%rowtype;
  profile_record public.profiles%rowtype;
  final_submission public.submissions%rowtype;
  signatory_record public.company_certificate_signatories%rowtype;
  certificate_type_value text;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select * into project_record from public.projects where id = new.project_id;
  select * into profile_record from public.profiles where id = new.student_user_id;
  select * into final_submission
  from public.submissions
  where assignment_id = new.id
  order by created_at desc
  limit 1;

  if project_record.id is null or profile_record.id is null then
    return new;
  end if;

  if project_record.project_source = 'practice' and not project_record.is_industry then
    certificate_type_value := 'project_learning';
  elsif project_record.project_source = 'company' and project_record.is_industry then
    select * into signatory_record
    from public.company_certificate_signatories
    where company_id = project_record.company_id;
    if signatory_record.id is null then
      return new;
    end if;
    certificate_type_value := 'company_project_completion';
  else
    return new;
  end if;

  insert into public.certificates (
    student_user_id, project_id, submission_id, assignment_id,
    certificate_type, recipient_name, project_title, project_description,
    skills, issuer_name, signatory_name, signatory_title, certificate_status
  )
  values (
    new.student_user_id, new.project_id,
    nullif(final_submission.id, '00000000-0000-0000-0000-000000000000'),
    new.id, certificate_type_value,
    coalesce(nullif(trim(profile_record.full_name), ''), 'BuildBridge Student'),
    project_record.title, left(coalesce(project_record.scope, ''), 600),
    coalesce(project_record.required_skills, '{}'::text[]), 'BuildBridge',
    signatory_record.signatory_name, signatory_record.signatory_title, 'issued'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists issue_completed_project_certificate_trigger on public.project_assignments;
create trigger issue_completed_project_certificate_trigger
after update of status on public.project_assignments
for each row execute function public.issue_completed_project_certificate();

notify pgrst, 'reload schema';

commit;
