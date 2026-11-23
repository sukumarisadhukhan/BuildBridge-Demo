begin;

alter table public.company_domain_requests
  drop constraint if exists company_domain_requests_status_check;

alter table public.company_domain_requests
  add constraint company_domain_requests_status_check
  check (status in (
    'submitted',
    'email_pending',
    'domain_pending',
    'pending_dns',
    'pending_admin',
    'pending_admin_review',
    'additional_information_required',
    'approved',
    'rejected'
  ));

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
  add column if not exists email_verified_at timestamptz,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists verification_expires_at timestamptz,
  add column if not exists previous_status text,
  add column if not exists submitted_document_urls text[];

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
  existing_company public.companies;
  target_status text;
begin
  select * into admin_row
  from public.profiles
  where id = admin_user_id and role = 'admin'::public.app_role;

  if admin_row.id is null or not exists (
    select 1 from public.platform_admin_owner owner
    where owner.singleton
      and owner.owner_user_id = admin_row.id
      and lower(owner.owner_email) = lower(admin_row.email)
  ) then
    raise exception 'Only the configured platform administrator can review company verification requests.';
  end if;

  if decision not in ('approved', 'rejected', 'additional_information_required') then
    raise exception 'Decision must be approved, rejected or request additional information.';
  end if;

  select * into request_row
  from public.company_domain_requests
  where id = request_id
  for update;

  if request_row.id is null then
    raise exception 'Company verification request not found.';
  end if;

  if decision = 'approved' and (
    request_row.dns_verified_at is null
    or request_row.email_verified_at is null
  ) then
    raise exception 'Email and DNS verification are required before manual approval.';
  end if;

  target_status := case
    when decision = 'approved' then 'approved'
    when decision = 'rejected' then 'rejected'
    else 'additional_information_required'
  end;

  update public.company_domain_requests
  set previous_status = status,
      status = target_status,
      reviewed_by = admin_row.id,
      reviewed_at = now(),
      review_note = nullif(left(trim(coalesce(note, '')), 1000), ''),
      updated_at = now()
  where id = request_row.id;

  if decision = 'approved' then
    update public.profiles
    set role = 'company_member'::public.app_role
    where id = request_row.user_id;

    select * into existing_company
    from public.companies
    where owner_user_id = request_row.user_id
    limit 1;

    if existing_company.id is null then
      insert into public.companies(owner_user_id, name, verified, verification_status)
      values (request_row.user_id, request_row.organization_name, true, 'approved')
      returning * into existing_company;
    else
      update public.companies
      set name = request_row.organization_name,
          verified = true,
          verification_status = 'approved'
      where id = existing_company.id;
    end if;

    insert into public.company_domains(domain, company_id, approved_by, approved_at)
    values (request_row.email_domain, existing_company.id, admin_row.id, now())
    on conflict (domain) do update
      set company_id = excluded.company_id,
          approved_by = excluded.approved_by,
          approved_at = excluded.approved_at;
  end if;

  insert into public.audit_logs(actor_user_id, action, entity_type, entity_id, details)
  values (
    admin_row.id,
    'company_verification_' || decision,
    'company_domain_request',
    request_row.id,
    jsonb_build_object(
      'domain', request_row.email_domain,
      'organization', request_row.organization_name,
      'user_id', request_row.user_id,
      'previous_status', request_row.status,
      'new_status', target_status,
      'reason', nullif(left(trim(coalesce(note, '')), 1000), '')
    )
  );

  perform public.notify_buildbridge_user(
    request_row.user_id,
    'project_update',
    'Company verification ' || decision,
    'The administrator ' ||
      case
        when decision = 'approved' then 'approved'
        when decision = 'rejected' then 'rejected'
        else 'requested additional information for'
      end ||
      ' ' || request_row.organization_name ||
      case when nullif(trim(coalesce(note, '')), '') is null then '.' else ': ' || left(trim(note), 1000) end,
    jsonb_build_object(
      'request_id', request_row.id,
      'decision', decision,
      'status', target_status,
      'reason', nullif(left(trim(coalesce(note, '')), 1000), '')
    ),
    'company-verification:' || decision || ':' || request_row.id::text
  );
end;
$$;

revoke all on function public.review_company_domain_request(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_company_domain_request(uuid, uuid, text, text) to service_role;

commit;
