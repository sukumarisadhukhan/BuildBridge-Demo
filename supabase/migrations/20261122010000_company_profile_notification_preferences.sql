begin;

alter table public.companies
  add column if not exists organization_type text,
  add column if not exists industry text,
  add column if not exists official_website text,
  add column if not exists organization_email text,
  add column if not exists description text,
  add column if not exists country_of_registration text,
  add column if not exists business_registration text,
  add column if not exists headquarters text,
  add column if not exists organization_contact text,
  add column if not exists authorized_representative_name text,
  add column if not exists authorized_representative_title text,
  add column if not exists authorized_representative_phone text;

alter table public.notification_preferences
  add column if not exists company_submission_updates boolean not null default true,
  add column if not exists company_milestone_updates boolean not null default true,
  add column if not exists company_applicant_updates boolean not null default true,
  add column if not exists company_verification_updates boolean not null default true,
  add column if not exists company_in_app_updates boolean not null default true;

grant update (
  organization_type,
  industry,
  official_website,
  organization_email,
  description,
  country_of_registration,
  business_registration,
  headquarters,
  organization_contact,
  authorized_representative_name,
  authorized_representative_title,
  authorized_representative_phone
) on public.companies to authenticated;

commit;
