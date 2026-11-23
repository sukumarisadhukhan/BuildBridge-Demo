-- Adds the update timestamp required for coursework_maps records.
--
-- Additive and idempotent. Existing rows receive created_at as their initial
-- updated_at value, which is the only timestamp those records have. No privileges
-- are changed: the authenticated role still has no UPDATE grant on this table, so
-- the trigger below only matters if an update path is added later.

begin;

alter table public.coursework_maps
  add column if not exists updated_at timestamptz;

update public.coursework_maps
set updated_at = created_at
where updated_at is null;

alter table public.coursework_maps
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_coursework_map_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_coursework_map_updated_at() from public, anon, authenticated;

drop trigger if exists touch_coursework_map_updated_at_trigger on public.coursework_maps;
create trigger touch_coursework_map_updated_at_trigger
before update on public.coursework_maps
for each row execute function public.touch_coursework_map_updated_at();

commit;
