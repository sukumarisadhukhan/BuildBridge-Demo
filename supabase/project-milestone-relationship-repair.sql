do $$
begin
  if to_regclass('public.project_milestones') is null or to_regclass('public.projects') is null then
    raise exception 'Both public.project_milestones and public.projects must exist before repairing the relationship.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_milestones' and column_name = 'project_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'id'
  ) then
    raise exception 'Expected project_milestones.project_id and projects.id. Inspect the live schema before repairing the relationship.';
  end if;
  if exists (
    select 1 from public.project_milestones m
    where not exists (select 1 from public.projects p where p.id = m.project_id)
  ) then
    raise exception 'Orphaned project_milestones rows exist. Resolve them without deleting project records before adding the foreign key.';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.project_milestones'::regclass
      and c.confrelid = 'public.projects'::regclass
      and c.contype = 'f'
      and c.conkey = array[(
        select a.attnum
        from pg_attribute a
        where a.attrelid = 'public.project_milestones'::regclass
          and a.attname = 'project_id'
          and not a.attisdropped
      )]::smallint[]
  ) then
    alter table public.project_milestones
      add constraint project_milestones_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete cascade;
  end if;
end
$$;

notify pgrst, 'reload schema';
