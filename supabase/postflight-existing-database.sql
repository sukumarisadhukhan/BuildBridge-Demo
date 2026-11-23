-- Read-only postflight checks after the ordered existing-database migrations.
-- Empty/missing rows require investigation before enabling affected workflows.

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
    ('profiles', 'academic_year'), ('profiles', 'location'), ('profiles', 'cgpa'),
    ('submissions', 'assignment_id'), ('submissions', 'milestone_id')
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
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles', 'companies', 'projects', 'submissions', 'opportunities', 'applications',
    'project_milestones', 'project_assignments', 'project_assignment_milestones',
    'company_domain_requests', 'notification_preferences', 'coursework_maps',
    'coursework_quizzes', 'coursework_quiz_answer_keys', 'coursework_quiz_attempts',
    'theory_certificates'
  )
order by c.relname;

select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles', 'projects', 'submissions', 'opportunities', 'applications',
    'company_domain_requests', 'notification_preferences', 'coursework_maps',
    'coursework_quizzes', 'coursework_quiz_answer_keys', 'theory_certificates',
    'learning_activity', 'learning_bookmarks', 'mentor_conversations',
    'mentor_messages', 'student_roadmaps'
  )
order by tablename, policyname;

select
  src.relname as table_name,
  con.conname as constraint_name,
  dst.relname as referenced_table,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_class dst on dst.oid = con.confrelid
where src_ns.nspname = 'public'
  and con.contype = 'f'
  and src.relname in (
    'projects', 'submissions', 'project_milestones', 'project_assignments',
    'project_assignment_milestones', 'certificates'
  )
order by src.relname, con.conname;

select 'duplicate_project_slugs' as check_name, count(*) as issue_count
from (
  select slug from public.projects
  where slug is not null
  group by slug having count(*) > 1
) duplicate_slugs
union all
select 'admin_profile_count', count(*)
from public.profiles where role::text = 'admin'
union all
select 'confirmed_admin_owner_matches', count(*)
from public.platform_admin_owner o
join public.profiles p on p.id = o.owner_user_id
join auth.users u on u.id = o.owner_user_id
where o.singleton
  and p.role::text = 'admin'
  and lower(o.owner_email) = lower(p.email)
  and lower(p.email) = lower(u.email)
  and u.email_confirmed_at is not null;