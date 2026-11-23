begin;

-- Compatibility fields required by the assignment workflow migration. This is
-- additive and safe to apply when these marketplace columns already exist.
do $$
declare
  project_status_type oid;
begin
  if to_regclass('public.projects') is null then
    raise exception 'Expected public.projects to exist. Do not run this compatibility migration before the BuildBridge base schema.';
  end if;
  if to_regtype('public.project_status') is null then
    raise exception 'Expected public.project_status enum. Review the existing projects.status type before migrating; this script will not convert it.';
  end if;
  select a.atttypid into project_status_type
  from pg_attribute a
  where a.attrelid = 'public.projects'::regclass
    and a.attname = 'status'
    and not a.attisdropped;
  if project_status_type is distinct from to_regtype('public.project_status') then
    raise exception 'public.projects.status must use public.project_status. No automatic type conversion was attempted.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.projects'::regclass
      and attname = 'company_user_id'
      and not attisdropped
  ) then
    raise exception 'Expected public.projects.company_user_id. Inspect the existing project schema before migrating.';
  end if;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.projects'::regclass
      and attname = 'is_industry'
      and not attisdropped
  ) then
    raise exception 'Expected public.projects.is_industry. Inspect project provenance before migrating.';
  end if;
end;
$$;

alter table public.projects
  add column if not exists project_source text not null default 'company',
  add column if not exists slug text,
  add column if not exists category text not null default 'Other',
  add column if not exists difficulty text not null default 'Intermediate',
  add column if not exists project_type text not null default 'Capstone',
  add column if not exists required_skills text[] not null default '{}',
  add column if not exists estimated_duration_days integer,
  add column if not exists problem_statement text not null default '',
  add column if not exists requirements jsonb not null default '[]'::jsonb,
  add column if not exists submission_format text not null default '',
  add column if not exists resources jsonb not null default '[]'::jsonb,
  add column if not exists evaluation_rubric jsonb not null default '[]'::jsonb,
  add column if not exists publisher_label text,
  add column if not exists published_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.projects alter column company_user_id drop not null;

update public.projects
set project_source = 'legacy'
where project_source = 'company'
  and is_industry = false;

do $$
begin
  if exists (
    select 1 from public.projects
    where slug is not null
    group by slug
    having count(*) > 1
  ) then
    raise exception 'Duplicate project slugs exist. Resolve them without deleting projects, then rerun this migration.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and contype = 'f'
      and confrelid = 'public.profiles'::regclass
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.projects'::regclass
          and attname = 'published_by'
          and not attisdropped
      )]::smallint[]
  ) then
    alter table public.projects
      add constraint projects_published_by_fkey
      foreign key (published_by) references public.profiles(id);
  end if;
end;
$$;

create unique index if not exists projects_slug_unique
  on public.projects(slug) where slug is not null;

commit;