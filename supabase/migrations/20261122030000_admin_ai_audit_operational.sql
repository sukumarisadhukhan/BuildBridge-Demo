begin;

alter table public.notification_preferences
  add column if not exists admin_company_verifications boolean not null default true,
  add column if not exists admin_ai_incidents boolean not null default true,
  add column if not exists admin_database_errors boolean not null default true,
  add column if not exists admin_certificate_errors boolean not null default true,
  add column if not exists admin_email_failures boolean not null default true;

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text,
  status text not null,
  success boolean not null,
  failure_category text,
  duration_ms integer not null default 0,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events(created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
grant select on public.ai_usage_events to authenticated;

drop policy if exists "platform admins read ai usage" on public.ai_usage_events;
create policy "platform admins read ai usage"
  on public.ai_usage_events for select to authenticated
  using (public.is_platform_admin());

create or replace function public.record_buildbridge_audit(
  actor_user_id uuid,
  actor_role text,
  action text,
  entity_type text,
  entity_id uuid,
  outcome text,
  metadata jsonb default '{}'::jsonb,
  correlation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  audit_id uuid;
begin
  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'actor_role', nullif(actor_role, ''),
        'outcome', nullif(outcome, ''),
        'correlation_id', nullif(correlation_id, '')
      )
  )
  returning id into audit_id;
  return audit_id;
end;
$$;

revoke all on public.record_buildbridge_audit from public, anon, authenticated;
grant execute on public.record_buildbridge_audit to service_role;

commit;
