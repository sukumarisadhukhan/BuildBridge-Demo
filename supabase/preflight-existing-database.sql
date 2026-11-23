-- Read-only preflight for an existing BuildBridge Supabase database.
-- Run before any migration. This script does not change schema or records.

with required_tables(table_name) as (
  values
    ('profiles'), ('companies'), ('projects'), ('submissions'), ('opportunities'),
    ('applications'), ('skill_evidence'), ('certificates'),
    ('project_milestones'), ('project_assignments'), ('project_milestone_progress'),
    ('project_assignment_milestones'), ('company_domain_requests'),
    ('notification_preferences'), ('notifications'), ('coursework_maps'),
    ('coursework_quizzes'), ('coursework_quiz_answer_keys'), ('coursework_quiz_attempts'),
    ('theory_certificates'), ('platform_admin_owner'), ('company_certificate_signatories'),
    ('learning_activity'), ('learning_bookmarks'), ('mentor_conversations'),
    ('mentor_messages'), ('student_roadmaps')
)
select r.table_name, c.oid is not null as is_present
from required_tables r
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
order by r.table_name;

with required_columns(table_name, column_name) as (
  values
    ('projects', 'status'), ('projects', 'company_user_id'), ('projects', 'slug'),
    ('projects', 'project_source'), ('projects', 'required_skills'),
    ('projects', 'publisher_label'), ('projects', 'published_by'), ('projects', 'updated_at'),
    ('project_milestones', 'project_id'),
    ('profiles', 'role'), ('profiles', 'email'), ('profiles', 'preferred_language'), ('profiles', 'education_level'),
    ('profiles', 'academic_year'), ('profiles', 'location'), ('profiles', 'cgpa')
)
select r.table_name, r.column_name, a.attname is not null as is_present
from required_columns r
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
left join pg_attribute a on a.attrelid = c.oid and a.attname = r.column_name and not a.attisdropped
order by r.table_name, r.column_name;

select
  n.nspname as schema_name,
  t.typname as enum_name,
  array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
left join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typname = 'project_status'
group by n.nspname, t.typname;

select
  r.table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from (values
  ('profiles'), ('companies'), ('projects'), ('submissions'), ('opportunities'),
  ('applications'), ('project_milestones'), ('project_assignments'),
  ('project_assignment_milestones'), ('company_domain_requests'),
  ('notification_preferences'), ('coursework_maps'), ('coursework_quizzes'),
  ('coursework_quiz_answer_keys'), ('coursework_quiz_attempts'), ('theory_certificates'),
  ('learning_activity'), ('learning_bookmarks'), ('mentor_conversations'),
  ('mentor_messages'), ('student_roadmaps')
) as r(table_name)
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = r.table_name
order by r.table_name;

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'projects', 'submissions', 'opportunities', 'applications', 'certificates')
order by tablename, policyname;

select
  src.relname as table_name,
  c.conname as constraint_name,
  dst.relname as referenced_table,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class src on src.oid = c.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class dst on dst.oid = c.confrelid
where src_ns.nspname = 'public'
  and c.contype = 'f'
  and src.relname in (
    'projects', 'submissions', 'project_milestones', 'project_assignments',
    'project_assignment_milestones', 'certificates'
  )
order by src.relname, c.conname;

do $$
declare
  duplicate_slug_count bigint;
  admin_profile_count bigint;
  owner_match_count bigint;
begin
  if to_regclass('public.projects') is not null and exists (
    select 1 from pg_attribute
    where attrelid = 'public.projects'::regclass and attname = 'slug' and not attisdropped
  ) then
    execute 'select count(*) from (select slug from public.projects where slug is not null group by slug having count(*) > 1) d'
      into duplicate_slug_count;
    raise notice 'Duplicate non-null project slugs: %', duplicate_slug_count;
  else
    raise notice 'Project slug check skipped: public.projects.slug is missing.';
  end if;

  if to_regclass('public.profiles') is not null then
    execute 'select count(*) from public.profiles where role::text = ''admin'''
      into admin_profile_count;
    raise notice 'Admin profile count: %', admin_profile_count;
  else
    admin_profile_count := 0;
    raise notice 'Admin ownership check skipped: public.profiles is missing.';
  end if;

  if to_regclass('public.platform_admin_owner') is not null
    and to_regclass('auth.users') is not null
    and to_regclass('public.profiles') is not null then
    execute 'select count(*) from public.platform_admin_owner o join public.profiles p on p.id = o.owner_user_id join auth.users u on u.id = o.owner_user_id where o.singleton and p.role::text = ''admin'' and lower(o.owner_email) = lower(p.email) and lower(p.email) = lower(u.email) and u.email_confirmed_at is not null'
      into owner_match_count;
    raise notice 'Confirmed admin owner matches: %', owner_match_count;
  else
    raise notice 'Admin owner match check skipped: one or more identity tables are missing.';
  end if;
end;
$$;