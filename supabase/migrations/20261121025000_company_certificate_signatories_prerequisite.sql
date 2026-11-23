-- Prerequisite for 20261121030000_project_assignment_milestone_workflow.sql.
--
-- That migration's legacy certificate correction references
-- public.company_certificate_signatories. The table was previously created only
-- by supabase/certificate-redesign.sql, which the documented order applies after
-- the workflow migrations. On a fresh chain the workflow migration failed with
-- "relation public.company_certificate_signatories does not exist".
--
-- This migration creates the same table, RLS policies and grants that
-- certificate-redesign.sql defines, so the workflow migration can run in order.
-- It is additive and idempotent: create ... if not exists, and drop policy if
-- exists before each create policy. It does not modify or delete any rows.
-- certificate-redesign.sql remains valid and may still be applied afterwards.

begin;

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

commit;
