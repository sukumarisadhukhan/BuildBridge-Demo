-- Read-only preflight for 20261122040000_master_schema_reconciliation.sql
-- Run in Supabase SQL Editor before the migration.

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
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'company_domain_requests'
  and column_name in (
    'official_website','organization_email','business_registration',
    'country_of_registration','organization_type','description',
    'authorized_representative_name','authorized_representative_title',
    'authorized_representative_phone','industry','company_size',
    'headquarters_address','logo_url','legal_name','brand_name',
    'email_verified_at','verification_attempts','verification_expires_at',
    'previous_status','submitted_document_urls','status'
  )
order by column_name;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'companies'
  and column_name in (
    'industry','organization_type','official_website','organization_email',
    'description','country_of_registration','business_registration',
    'headquarters','headquarters_address','organization_contact',
    'authorized_representative_name','authorized_representative_title',
    'authorized_representative_phone','company_size','logo_url','legal_name','brand_name'
  )
order by column_name;

select
  conname,
  pg_get_constraintdef(oid) as constraint_definition
from pg_constraint
where conrelid = 'public.company_domain_requests'::regclass
  and contype = 'c';

