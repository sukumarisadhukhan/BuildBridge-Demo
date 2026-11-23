begin;

alter table public.profiles
  add column if not exists preferred_language text not null default 'en',
  add column if not exists learning_personalization_enabled boolean not null default true,
  add column if not exists bio text,
  add column if not exists education_level text,
  add column if not exists institution text,
  add column if not exists field_of_study text,
  add column if not exists profile_skills text[] not null default '{}';

-- Public metadata never grants an employer role. Company access is granted
-- only after both domain verification and an administrator decision.
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
revoke all on function public.request_company_role() from public, anon, authenticated;

create table if not exists public.company_domain_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  email_domain text not null,
  organization_name text not null,
  dns_token text not null,
  status text not null default 'pending_dns'
    check (status in ('pending_dns', 'pending_admin', 'approved', 'rejected')),
  dns_verified_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_domain_requests_status_created
  on public.company_domain_requests(status, created_at desc);

create table if not exists public.platform_admin_owner (
  singleton boolean primary key default true check (singleton),
  owner_user_id uuid not null unique references public.profiles(id),
  owner_email text not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_admin_owner enable row level security;
revoke all on public.platform_admin_owner from public, anon, authenticated;
grant all on public.platform_admin_owner to service_role;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.platform_admin_owner a
      on a.owner_user_id = p.id
      and lower(a.owner_email) = lower(p.email)
    where p.id = auth.uid()
      and p.role = 'admin'::public.app_role
      and lower(coalesce(auth.jwt()->>'email', '')) = lower(p.email)
  )
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create table if not exists public.company_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  company_id uuid references public.companies(id) on delete cascade,
  approved_by uuid not null references public.profiles(id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  project_updates boolean not null default true,
  deadline_reminders boolean not null default true,
  opportunity_updates boolean not null default true,
  learning_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created
  on public.notifications(user_id, created_at desc);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  recipient_email text not null,
  event_type text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'suppressed', 'exhausted')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists email_outbox_pending
  on public.email_outbox(status, next_attempt_at) where status in ('pending', 'failed');

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.email_outbox(id) on delete cascade,
  provider text not null,
  status text not null,
  provider_message_id text,
  detail text,
  created_at timestamptz not null default now()
);

create table if not exists public.deadline_reminder_log (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  days_before_deadline integer not null check (days_before_deadline in (1, 7)),
  sent_at timestamptz not null default now(),
  unique (assignment_id, days_before_deadline)
);

alter table public.company_domain_requests enable row level security;
alter table public.company_domains enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.email_outbox enable row level security;
alter table public.email_delivery_logs enable row level security;
alter table public.deadline_reminder_log enable row level security;

drop policy if exists "users read own domain request" on public.company_domain_requests;
create policy "users read own domain request" on public.company_domain_requests
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "admins read approved company domains" on public.company_domains;
create policy "admins read approved company domains" on public.company_domains
  for select to authenticated using (public.is_platform_admin());
drop policy if exists "users manage own notification preferences" on public.notification_preferences;
create policy "users manage own notification preferences" on public.notification_preferences
  for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users update own notification read state" on public.notifications;
create policy "users update own notification read state" on public.notifications
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
drop policy if exists "admins read email delivery logs" on public.email_delivery_logs;
create policy "admins read email delivery logs" on public.email_delivery_logs
  for select to authenticated using (public.is_platform_admin());

grant select on public.company_domain_requests to authenticated;
grant select on public.company_domains to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant all on public.company_domain_requests, public.company_domains, public.email_outbox,
  public.email_delivery_logs, public.deadline_reminder_log to service_role;
grant all on public.notifications to service_role;

create or replace function public.notify_buildbridge_user(
  target_user_id uuid,
  event_kind text,
  event_title text,
  event_body text,
  event_payload jsonb,
  event_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  notification_id uuid;
  target_email text;
  prefs public.notification_preferences;
  event_enabled boolean;
begin
  if target_user_id is null or event_dedupe_key is null then return; end if;
  insert into public.notifications(user_id, kind, title, body, payload, dedupe_key)
  values (target_user_id, event_kind, event_title, event_body, coalesce(event_payload, '{}'::jsonb) || jsonb_build_object('body', event_body), event_dedupe_key)
  on conflict (dedupe_key) do nothing
  returning id into notification_id;
  if notification_id is null then return; end if;

  insert into public.notification_preferences(user_id) values (target_user_id)
  on conflict (user_id) do nothing;
  select * into prefs from public.notification_preferences where user_id = target_user_id;
  event_enabled := case
    when event_kind = 'deadline_reminder' then prefs.deadline_reminders
    when event_kind = 'opportunity_update' then prefs.opportunity_updates
    when event_kind = 'learning_update' then prefs.learning_updates
    else prefs.project_updates
  end;
  if not prefs.email_enabled or not event_enabled then return; end if;
  select email into target_email from public.profiles where id = target_user_id;
  if target_email is null or length(trim(target_email)) = 0 then return; end if;

  insert into public.email_outbox(user_id, notification_id, recipient_email, event_type, subject, payload, dedupe_key)
  values (target_user_id, notification_id, target_email, event_kind, event_title, coalesce(event_payload, '{}'::jsonb) || jsonb_build_object('body', event_body), 'notification:' || event_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke all on function public.notify_buildbridge_user(uuid, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.notify_buildbridge_user(uuid, text, text, text, jsonb, text) to service_role;

create or replace function public.review_company_domain_request(
  request_id uuid,
  admin_user_id uuid,
  decision text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.company_domain_requests;
  admin_row public.profiles;
begin
  select * into admin_row from public.profiles where id = admin_user_id and role = 'admin'::public.app_role;
  if admin_row.id is null or not exists (
    select 1 from public.platform_admin_owner owner
    where owner.singleton
      and owner.owner_user_id = admin_row.id
      and lower(owner.owner_email) = lower(admin_row.email)
  ) then
    raise exception 'Only the configured platform administrator can review company domains.';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select * into request_row from public.company_domain_requests
  where id = request_id for update;
  if request_row.id is null then raise exception 'Company domain request was not found.'; end if;
  if decision = 'approved' and request_row.dns_verified_at is null then
    raise exception 'The organization must prove domain ownership before approval.';
  end if;

  update public.company_domain_requests
  set status = decision, reviewed_by = admin_row.id, reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(note, '')), 1000), ''),
      updated_at = now()
  where id = request_row.id;

  if decision = 'approved' then
    update public.profiles set role = 'company_member' where id = request_row.user_id;
    insert into public.company_domains(domain, approved_by, approved_at)
    values (request_row.email_domain, admin_row.id, now())
    on conflict (domain) do update
      set approved_by = excluded.approved_by, approved_at = excluded.approved_at;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (admin_row.id, 'company_domain_' || decision, 'company_domain_request', request_row.id,
    jsonb_build_object('domain', request_row.email_domain, 'user_id', request_row.user_id));
end;
$$;
revoke all on function public.review_company_domain_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_company_domain_request(uuid, uuid, text, text) to service_role;

create or replace function public.notify_project_assignment_started()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare project_title text;
begin
  select title into project_title from public.projects where id = new.project_id;
  perform public.notify_buildbridge_user(
    new.student_user_id, 'project_update', 'Project started',
    'Your project "' || coalesce(project_title, 'BuildBridge project') || '" is now in My Projects.',
    jsonb_build_object('projectId', new.project_id, 'assignmentId', new.id),
    'assignment-started:' || new.id::text
  );
  return new;
end $$;
drop trigger if exists notify_assignment_started on public.project_assignments;
create trigger notify_assignment_started after insert on public.project_assignments
  for each row execute function public.notify_project_assignment_started();

create or replace function public.notify_project_submission()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare project_title text; company_user uuid;
begin
  select p.title, p.company_user_id into project_title, company_user
  from public.projects p where p.id = new.project_id;
  if company_user is not null then
    perform public.notify_buildbridge_user(
      company_user, 'project_update', 'Student evidence submitted',
      'A student submitted evidence for "' || coalesce(project_title, 'your project') || '".',
      jsonb_build_object('projectId', new.project_id, 'submissionId', new.id),
      'submission-created:' || new.id::text
    );
  end if;
  return new;
end $$;
drop trigger if exists notify_submission_created on public.submissions;
create trigger notify_submission_created after insert on public.submissions
  for each row execute function public.notify_project_submission();

create or replace function public.notify_submission_reviewed()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare project_title text;
begin
  if new.company_decision is not distinct from old.company_decision then return new; end if;
  select title into project_title from public.projects where id = new.project_id;
  perform public.notify_buildbridge_user(
    new.student_user_id, 'project_update', 'Project evidence reviewed',
    'Your submission for "' || coalesce(project_title, 'your project') || '" was ' || coalesce(new.company_decision, 'updated') || '.',
    jsonb_build_object('projectId', new.project_id, 'submissionId', new.id, 'decision', new.company_decision),
    'submission-reviewed:' || new.id::text || ':' || coalesce(new.company_decision, 'updated')
  );
  return new;
end $$;
drop trigger if exists notify_submission_reviewed on public.submissions;
create trigger notify_submission_reviewed after update of company_decision on public.submissions
  for each row execute function public.notify_submission_reviewed();

commit;
