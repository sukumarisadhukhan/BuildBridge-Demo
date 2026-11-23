begin;

-- 1. Company verification request table
do $$
begin
  if to_regclass('public.company_domain_requests') is null then
    raise exception 'Apply 20261121040000_platform_identity_notifications.sql before this reconciliation migration.';
  end if;

  alter table public.company_domain_requests
    alter column organization_name drop not null,
    alter column email_domain drop not null,
    alter column dns_token drop not null;

  alter table public.company_domain_requests
    alter column status set default 'details_pending';
end;
$$;

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
  add column if not exists submitted_document_urls text[];

-- Normalize legacy statuses before installing the reconciled constraint.
update public.company_domain_requests
set status = 'details_pending',
    updated_at = coalesce(updated_at, now())
where status is null;

update public.company_domain_requests
set status = 'domain_pending',
    previous_status = coalesce(previous_status, status),
    updated_at = coalesce(updated_at, now())
where status = 'pending_dns';

update public.company_domain_requests
set status = 'pending_admin_review',
    previous_status = coalesce(previous_status, status),
    updated_at = coalesce(updated_at, now())
where status = 'pending_admin';

do $$
declare
  unknown_status text;
begin
  select status into unknown_status
  from public.company_domain_requests
  where status is not null
    and status not in (
      'details_pending',
      'submitted',
      'email_pending',
      'domain_pending',
      'pending_admin_review',
      'additional_information_required',
      'approved',
      'rejected'
    )
  limit 1;

  if unknown_status is not null then
    raise exception 'Unrecognized company_domain_requests status: %. Run the preflight and reconcile it before this migration.', unknown_status;
  end if;
end;
$$;

alter table public.company_domain_requests
  drop constraint if exists company_domain_requests_status_check;

alter table public.company_domain_requests
  add constraint company_domain_requests_status_check
  check (status in (
    'details_pending',
    'submitted',
    'email_pending',
    'domain_pending',
    'pending_admin_review',
    'additional_information_required',
    'approved',
    'rejected'
  ));

alter table public.company_domain_requests
  alter column status set not null,
  alter column status set default 'details_pending';

create or replace function public.validate_company_verification_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'details_pending' then
      return new;
    end if;
  elsif new.status is distinct from old.status then
    if old.status = 'approved' then
      raise exception 'An approved company verification cannot be changed directly.';
    end if;
    if old.status = 'details_pending'
      and new.status not in ('domain_pending','submitted','email_pending','rejected','additional_information_required') then
      raise exception 'Details pending requests must first submit complete organization details.';
    end if;
  end if;

  if new.status = 'approved'
    and (new.email_verified_at is null or new.dns_verified_at is null) then
    raise exception 'Email and DNS verification are required before approval.';
  end if;

  if new.status = 'pending_admin_review'
    and (new.email_verified_at is null or new.dns_verified_at is null) then
    raise exception 'Email and DNS verification are required before administrator review.';
  end if;

  if new.status not in ('details_pending','rejected')
    and (
      new.organization_name is null or btrim(new.organization_name) = ''
      or new.email_domain is null or btrim(new.email_domain) = ''
      or new.organization_email is null or btrim(new.organization_email) = ''
      or new.authorized_representative_name is null or btrim(new.authorized_representative_name) = ''
      or new.official_website is null or btrim(new.official_website) = ''
      or new.organization_type is null or btrim(new.organization_type) = ''
      or new.country_of_registration is null or btrim(new.country_of_registration) = ''
      or new.dns_token is null or btrim(new.dns_token) = ''
    ) then
    raise exception 'Complete organization details are required before verification progression.';
  end if;

  return new;
end;
$$;

drop trigger if exists company_verification_transition_guard on public.company_domain_requests;
create trigger company_verification_transition_guard
before insert or update of status,organization_name,email_domain,organization_email,
  authorized_representative_name,dns_token,email_verified_at,dns_verified_at
on public.company_domain_requests
for each row execute function public.validate_company_verification_transition();

-- 2. Approved company profile table
do $$
begin
  if to_regclass('public.companies') is null then
    raise exception 'Public.companies must exist before this reconciliation migration.';
  end if;
end;
$$;

alter table public.companies
  add column if not exists industry text,
  add column if not exists organization_type text,
  add column if not exists official_website text,
  add column if not exists organization_email text,
  add column if not exists description text,
  add column if not exists country_of_registration text,
  add column if not exists business_registration text,
  add column if not exists headquarters text,
  add column if not exists headquarters_address text,
  add column if not exists organization_contact text,
  add column if not exists authorized_representative_name text,
  add column if not exists authorized_representative_title text,
  add column if not exists authorized_representative_phone text,
  add column if not exists company_size text,
  add column if not exists logo_url text,
  add column if not exists legal_name text,
  add column if not exists brand_name text;

-- 3. Unified Vault: only reconcile if the existing Vault migration/table exists.
do $$
begin
  if to_regclass('public.student_vault_artifacts') is not null then
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

    with ranked as (
      select id,
             source_key,
             row_number() over (
               partition by student_user_id, source_key
               order by updated_at desc nulls last, created_at desc nulls last, id
             ) as duplicate_rank
      from public.student_vault_artifacts
      where source_key is not null
    )
    update public.student_vault_artifacts artifact
    set source_key = artifact.source_key || ':duplicate:' || artifact.id::text
    from ranked
    where artifact.id = ranked.id
      and ranked.duplicate_rank > 1;

    drop index if exists public.student_vault_artifacts_source_unique;
    create unique index student_vault_artifacts_source_unique
      on public.student_vault_artifacts(student_user_id, source_key)
      where source_key is not null;
  end if;
end;
$$;

-- 4. Playback session: reconcile only if an existing table or API contract requires it.
do $$
begin
  if to_regprocedure('public.current_user_role()') is null then
    raise exception 'Apply the existing auth migration that defines public.current_user_role() before this reconciliation migration.';
  end if;
  if to_regtype('public.app_role') is null then
    raise exception 'Apply the existing app_role enum migration before this reconciliation migration.';
  end if;

  if to_regclass('public.learning_playback_sessions') is null then
    create table public.learning_playback_sessions (
      id uuid primary key default gen_random_uuid(),
      student_user_id uuid not null references public.profiles(id) on delete cascade,
      video_id text not null,
      title text not null,
      channel text,
      thumbnail text,
      topic text,
      position_seconds numeric(12,3) not null default 0,
      duration_seconds numeric(12,3),
      completed boolean not null default false,
      active_filters jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      unique(student_user_id)
    );
  else
    alter table public.learning_playback_sessions
      add column if not exists id uuid,
      add column if not exists video_id text,
      add column if not exists title text,
      add column if not exists channel text,
      add column if not exists thumbnail text,
      add column if not exists topic text,
      add column if not exists position_seconds numeric(12,3) not null default 0,
      add column if not exists duration_seconds numeric(12,3),
      add column if not exists completed boolean not null default false,
      add column if not exists active_filters jsonb not null default '{}'::jsonb,
      add column if not exists updated_at timestamptz not null default now();

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='learning_playback_sessions'
        and column_name='student_user_id'
    ) then
      raise exception 'Existing learning_playback_sessions has no student_user_id column.';
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='learning_playback_sessions'
        and column_name='id'
    ) then
      raise exception 'Existing learning_playback_sessions has no id column.';
    end if;

    update public.learning_playback_sessions
    set id = gen_random_uuid()
    where id is null;

    alter table public.learning_playback_sessions
      alter column id set default gen_random_uuid(),
      alter column id set not null;

    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.learning_playback_sessions'::regclass
        and contype = 'p'
    ) then
      alter table public.learning_playback_sessions
        add constraint learning_playback_sessions_pkey primary key(id);
    end if;

    delete from public.learning_playback_sessions duplicate
    where duplicate.id in (
      select id
      from (
        select id,
               row_number() over (
                 partition by student_user_id
                 order by updated_at desc nulls last, id desc
               ) duplicate_rank
        from public.learning_playback_sessions
      ) ranked
      where duplicate_rank > 1
    );

    alter table public.learning_playback_sessions
      alter column position_seconds set default 0,
      alter column position_seconds set not null,
      alter column completed set default false,
      alter column completed set not null,
      alter column active_filters set default '{}'::jsonb,
      alter column active_filters set not null,
      alter column updated_at set default now(),
      alter column updated_at set not null;

    alter table public.learning_playback_sessions
      drop constraint if exists learning_playback_sessions_student_user_id_key;
    create unique index if not exists learning_playback_sessions_student_unique
      on public.learning_playback_sessions(student_user_id);
  end if;

  alter table public.learning_playback_sessions enable row level security;
  revoke all on public.learning_playback_sessions from anon, authenticated;
  grant select, insert, update, delete on public.learning_playback_sessions to authenticated;

  drop policy if exists "students manage own playback session" on public.learning_playback_sessions;
  create policy "students manage own playback session"
    on public.learning_playback_sessions for all to authenticated
    using (
      student_user_id = auth.uid()
      and public.current_user_role() = 'student'::public.app_role
    )
    with check (
      student_user_id = auth.uid()
      and public.current_user_role() = 'student'::public.app_role
    );
end;
$$;

notify pgrst, 'reload schema';

commit;
