-- BuildBridge backend repair: READ-ONLY preflight.
--
-- Run in the Supabase SQL Editor BEFORE applying the backend repair migrations.
-- This script changes nothing. It only reads the catalog and writes results to a
-- session-local temp table. Save the output with your backup record.
--
-- Status meanings:
--   PASS     the object or constraint exists and meets the requirement
--   MISSING  not present yet; the migration named in the check creates it
--   FAIL     present but wrong, or a data problem that must be resolved first
--   INFO     informational; no action required by this script
--
-- Apply order: docs/DATABASE-MIGRATIONS.md. Do not run database-schema.sql on an
-- existing project.

drop table if exists pg_temp.bb_results;
create temp table bb_results (ord int, check_name text, status text, detail text);

do $$
declare
  n bigint;
  ord int := 0;
  migration_recorded boolean;
begin
  -- Bug 1: preferred_language
  ord := ord + 1;
  insert into bb_results values (ord, 'profiles.preferred_language exists [20261121040000]',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_language')
      then 'PASS' else 'MISSING' end,
    'Profile, roadmap, coursework, resources and AI Mentor queries select this column.');

  ord := ord + 1;
  insert into bb_results values (ord, 'profiles read self or admin policy present',
    case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles read self or admin') then 'PASS' else 'MISSING' end,
    'Existing policy name must be preserved exactly.');

  ord := ord + 1;
  insert into bb_results values (ord, 'profiles update self limited policy present',
    case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles update self limited') then 'PASS' else 'MISSING' end,
    'Existing policy name must be preserved exactly.');

  -- Bug 2: coursework_maps
  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps table exists [20261121050000]',
    case when to_regclass('public.coursework_maps') is not null then 'PASS' else 'MISSING' end,
    'Coursework upload and history read and write this table.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_quizzes table exists [20261121050000]',
    case when to_regclass('public.coursework_quizzes') is not null then 'PASS' else 'MISSING' end,
    'Knowledge-check questions are stored here.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_quiz_answer_keys table exists [20261121050000]',
    case when to_regclass('public.coursework_quiz_answer_keys') is not null then 'PASS' else 'MISSING' end,
    'Private grading data must not be exposed to authenticated users.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_quiz_attempts table exists [20261121050000]',
    case when to_regclass('public.coursework_quiz_attempts') is not null then 'PASS' else 'MISSING' end,
    'Quiz attempts and scores are stored here.');

  ord := ord + 1;
  insert into bb_results values (ord, 'theory_certificates table exists [20261121050000]',
    case when to_regclass('public.theory_certificates') is not null then 'PASS' else 'MISSING' end,
    'Coursework completion credentials.');

  ord := ord + 1;
  insert into bb_results values (ord, 'mentor_conversations prerequisite exists [learning-ai.sql]',
    case when to_regclass('public.mentor_conversations') is not null then 'PASS' else 'MISSING' end,
    'Migration 20261121050000 grants DELETE on this table; apply learning-ai.sql first if absent.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps RLS enabled',
    case (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'coursework_maps')
      when true then 'PASS' when false then 'FAIL' else 'MISSING' end,
    'Row-level security must stay enabled. Disabling it is not an acceptable fix.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps owner policy present',
    case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coursework_maps'
      and policyname = 'students manage own coursework maps') then 'PASS' else 'MISSING' end,
    'Students may access only their own coursework records.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps.updated_at exists [20261121055000]',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'coursework_maps' and column_name = 'updated_at')
      then 'PASS' else 'MISSING' end,
    'Update timestamp required by the coursework record contract.');

  -- Bug 3: projects -> project_milestones
  ord := ord + 1;
  insert into bb_results values (ord, 'projects.status uses public.project_status',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'status'
        and udt_name = 'project_status') then 'PASS'
      when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'status') then 'FAIL'
      else 'MISSING' end,
    'If FAIL, the status type must be reviewed. Do not convert the enum as part of this repair.');

  ord := ord + 1;
  insert into bb_results values (ord, 'projects.slug column exists [20261121020000]',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'slug')
      then 'PASS' else 'MISSING' end,
    'Marketplace slug column.');

  ord := ord + 1;
  if to_regclass('public.projects') is null then
    insert into bb_results values (ord, 'duplicate project slugs', 'FAIL', 'public.projects does not exist.');
  elsif not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'slug') then
    insert into bb_results values (ord, 'duplicate project slugs', 'MISSING', 'Column not yet added.');
  else
    execute 'select count(*) from (select slug from public.projects where slug is not null group by slug having count(*) > 1) d' into n;
    insert into bb_results values (ord, 'duplicate project slugs',
      case when n = 0 then 'PASS' else 'FAIL' end,
      'Duplicate slugs: ' || n || '. The compatibility migration aborts until these are resolved without deleting projects.');
  end if;

  ord := ord + 1;
  insert into bb_results values (ord, 'project_milestones table exists [20261121030000]',
    case when exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'project_milestones' and c.relkind in ('r', 'p')
    ) then 'PASS' else 'MISSING' end,
    'Milestone table used by the project marketplace and assignment workflow.');

  ord := ord + 1;
  insert into bb_results values (ord, 'project_milestones.project_id column exists [20261121030000]',
    case when to_regclass('public.project_milestones') is null then 'MISSING'
      when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'project_milestones' and column_name = 'project_id')
      then 'PASS' else 'FAIL' end,
    'If absent, stop before the workflow or FK repair. Inspect existing columns and constraints; do not infer a project mapping.');

  ord := ord + 1;
  insert into bb_results values (ord, 'project_milestones_project_id_fkey present',
    case when exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid join pg_namespace tn on tn.oid = t.relnamespace
      join pg_class r on r.oid = c.confrelid join pg_namespace rn on rn.oid = r.relnamespace
      where c.contype = 'f' and c.conname = 'project_milestones_project_id_fkey'
        and tn.nspname = 'public' and t.relname = 'project_milestones'
        and rn.nspname = 'public' and r.relname = 'projects')
    then 'PASS' else 'MISSING' end,
    'PostgREST embeds projects -> project_milestones through this foreign key.');

  ord := ord + 1;
  if to_regclass('public.project_milestones') is null then
    insert into bb_results values (ord, 'orphaned project_milestones rows', 'MISSING', 'Table not yet created.');
  elsif not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'project_milestones' and column_name = 'project_id') then
    insert into bb_results values (ord, 'orphaned project_milestones rows', 'FAIL',
      'Cannot check for orphans because project_milestones.project_id is missing. Inspect the live table before changing it.');
  else
    execute 'select count(*) from public.project_milestones m where not exists (select 1 from public.projects p where p.id = m.project_id)' into n;
    insert into bb_results values (ord, 'orphaned project_milestones rows',
      case when n = 0 then 'PASS' else 'FAIL' end,
      'Orphaned rows: ' || n || '. The foreign key cannot be added while orphans exist. Resolve them; do not delete projects.');
  end if;

  -- Prerequisites and workflow tables
  ord := ord + 1;
  insert into bb_results values (ord, 'company_certificate_signatories exists [20261121025000]',
    case when to_regclass('public.company_certificate_signatories') is not null then 'PASS' else 'MISSING' end,
    'Required by the workflow migration legacy-certificate correction.');

  ord := ord + 1;
  insert into bb_results values (ord, 'project_assignments exists [20261121030000]',
    case when to_regclass('public.project_assignments') is not null then 'PASS' else 'MISSING' end,
    'Student project starts and milestone progress.');

  ord := ord + 1;
  insert into bb_results values (ord, 'company_domain_requests exists [20261121040000]',
    case when to_regclass('public.company_domain_requests') is not null then 'PASS' else 'MISSING' end,
    'Company domain verification requests.');

  ord := ord + 1;
  insert into bb_results values (ord, 'company_domains exists [20261121040000]',
    case when to_regclass('public.company_domains') is not null then 'PASS' else 'MISSING' end,
    'Approved company domains.');

  ord := ord + 1;
  insert into bb_results values (ord, 'notification_preferences exists [20261121040000]',
    case when to_regclass('public.notification_preferences') is not null then 'PASS' else 'MISSING' end,
    'Per-user notification settings.');

  ord := ord + 1;
  insert into bb_results values (ord, 'notifications exists [20261121040000]',
    case when to_regclass('public.notifications') is not null then 'PASS' else 'MISSING' end,
    'Notification center.');

  ord := ord + 1;
  insert into bb_results values (ord, 'email_outbox exists [20261121040000]',
    case when to_regclass('public.email_outbox') is not null then 'PASS' else 'MISSING' end,
    'Queued notification email delivery.');

  ord := ord + 1;
  insert into bb_results values (ord, 'email_delivery_logs exists [20261121040000]',
    case when to_regclass('public.email_delivery_logs') is not null then 'PASS' else 'MISSING' end,
    'Notification delivery audit trail.');

  ord := ord + 1;
  insert into bb_results values (ord, 'deadline_reminder_log exists [20261121040000]',
    case when to_regclass('public.deadline_reminder_log') is not null then 'PASS' else 'MISSING' end,
    'Deduplication for assignment deadline reminders.');

  ord := ord + 1;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    insert into bb_results values (ord, 'migration history 20261121050000/55000', 'INFO',
      'History table is unavailable. SQL Editor runs may not be recorded; use catalog checks as authoritative evidence.');
  else
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
      into migration_recorded using '20261121050000';
    insert into bb_results values (ord, 'migration history 20261121050000', 'INFO',
      case when migration_recorded then 'Version is recorded; compare all expected tables before trusting it.'
        else 'Version is not recorded; it may be pending or may have been run manually.' end);
    ord := ord + 1;
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
      into migration_recorded using '20261121055000';
    insert into bb_results values (ord, 'migration history 20261121055000', 'INFO',
      case when migration_recorded then 'Version is recorded; confirm coursework_maps.updated_at exists.'
        else 'Version is not recorded; it may be pending or may have been run manually.' end);
    ord := ord + 1;
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
      into migration_recorded using '20261121056000';
    insert into bb_results values (ord, 'migration history 20261121056000', 'INFO',
      case when migration_recorded then 'Version is recorded; confirm the company verification privilege check passes.'
        else 'Version is not recorded; it may be pending or may have been run manually.' end);
  end if;

  ord := ord + 1;
  insert into bb_results values (ord, 'authenticated cannot write company verification state [20261121056000]',
    case
      when to_regclass('public.companies') is null then 'MISSING'
      when not has_column_privilege('authenticated', 'public.companies', 'verified', 'INSERT')
        and not has_column_privilege('authenticated', 'public.companies', 'verified', 'UPDATE')
        and not has_column_privilege('authenticated', 'public.companies', 'verification_status', 'INSERT')
        and not has_column_privilege('authenticated', 'public.companies', 'verification_status', 'UPDATE')
        and not has_column_privilege('authenticated', 'public.companies', 'owner_user_id', 'UPDATE')
        then 'PASS'
      else 'MISSING'
    end,
    'Authenticated company records can only be verified through the configured administrator workflow.');

  ord := ord + 1;
  insert into bb_results values (ord, 'project workflow RLS policies exist [20261121057000]',
    case
      when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_assignments'
        and policyname in ('student starts own assignment', 'student reads own assignments', 'assigning company reads assignments'))
        or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions'
          and policyname in ('student inserts own workflow submission', 'student reads own submissions',
            'assigning company reads submissions', 'assigning company reviews submissions'))
        then 'MISSING'
      else 'PASS'
    end,
    'Apply 20261121057000 to ensure assignment, submission, progress and evidence policies.');

  -- Administrator owner (manual provisioning step; informational here)
  ord := ord + 1;
  if to_regclass('public.platform_admin_owner') is null then
    insert into bb_results values (ord, 'platform_admin_owner rows', 'MISSING', 'Table not yet created.');
  else
    execute 'select count(*) from public.platform_admin_owner' into n;
    insert into bb_results values (ord, 'platform_admin_owner rows', 'INFO',
      'Rows: ' || n || '. Provision the single platform owner only after the migrations are verified.');
  end if;
end $$;

select check_name, status, detail from bb_results order by ord;

-- Safe shape diagnostics for an existing milestone table. These queries return
-- catalog metadata only; they do not expose project or student records.
select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'project_milestones'
order by ordinal_position;

select c.conname as constraint_name, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'project_milestones'
order by c.conname;
