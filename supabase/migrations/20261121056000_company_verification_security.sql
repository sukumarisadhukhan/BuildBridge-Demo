begin;

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception 'Expected public.companies to exist before applying company verification security.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'owner_user_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'name'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'verified'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies' and column_name = 'verification_status'
  ) then
    raise exception 'public.companies is missing expected verification columns; inspect the live schema before applying this migration.';
  end if;
end;
$$;

revoke insert, update on public.companies from authenticated;
grant insert (owner_user_id, name), update (name) on public.companies to authenticated;

commit;
