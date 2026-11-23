-- Compatibility guard: company access is granted only by the verified-domain
-- administrator workflow. Client-provided signup intent cannot change roles.
create or replace function public.request_company_role()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
	raise exception 'Company role access requires verified domain ownership and administrator approval.';
end;
$$;
revoke all on function public.request_company_role() from public, anon, authenticated;
