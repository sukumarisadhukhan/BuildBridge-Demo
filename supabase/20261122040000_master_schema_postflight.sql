-- Read-only postflight for 20261122040000_master_schema_reconciliation.sql
-- Run after the migration.

select
  to_regclass('public.company_domain_requests') is not null as company_requests_table_exists,
  to_regclass('public.companies') is not null as companies_table_exists,
  to_regclass('public.student_vault_artifacts') is not null as vault_table_exists,
  to_regclass('public.learning_playback_sessions') is not null as playback_table_exists,
  to_regprocedure('public.current_user_role()') is not null as current_user_role_exists,
  to_regtype('public.app_role') is not null as app_role_exists;

select status, count(*) as request_count
from public.company_domain_requests
group by status
order by status;

select
  count(*) filter (where status = 'approved') as approved,
  count(*) filter (where status = 'approved' and (email_verified_at is null or dns_verified_at is null)) as approved_missing_verification,
  count(*) filter (where status = 'pending_admin_review' and (email_verified_at is null or dns_verified_at is null)) as pending_review_missing_verification,
  count(*) filter (where status <> 'details_pending' and (
    organization_name is null or btrim(organization_name) = ''
    or email_domain is null or btrim(email_domain) = ''
    or organization_email is null or btrim(organization_email) = ''
  )) as progression_missing_core_details
from public.company_domain_requests;

select
  count(*) as vault_row_count,
  count(*) filter (where source_key is not null) as rows_with_source_key
from public.student_vault_artifacts;

select
  count(*) as duplicate_vault_source_rows
from (
  select student_user_id, source_key
  from public.student_vault_artifacts
  where source_key is not null
  group by student_user_id, source_key
  having count(*) > 1
) duplicates;

select
  count(*) as playback_row_count,
  count(distinct student_user_id) as playback_student_count
from public.learning_playback_sessions;

select
  count(*) as duplicate_playback_students
from (
  select student_user_id
  from public.learning_playback_sessions
  group by student_user_id
  having count(*) > 1
) duplicates;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('student_vault_artifacts','learning_playback_sessions');

select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'learning_playback_sessions';
