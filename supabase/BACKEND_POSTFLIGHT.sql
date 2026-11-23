-- BuildBridge backend repair: READ-ONLY postflight verification.
--
-- Run in the Supabase SQL Editor AFTER applying the backend repair migrations.
-- Every row should be PASS. PENDING on the admin owner row means the owner has not
-- been provisioned yet; that is a separate, deliberate manual step.
--
-- The final statement asks PostgREST to reload its schema cache. This is safe to
-- run repeatedly. It does not change any data.

drop table if exists pg_temp.bb_results;
create temp table bb_results (ord int, check_name text, status text, detail text);

do $$
declare
  n bigint;
  ord int := 0;
  rls boolean;
  rls_table text;
begin
  ord := ord + 1;
  insert into bb_results values (ord, 'profiles.preferred_language exists, not null',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_language'
        and is_nullable = 'NO') then 'PASS' else 'FAIL' end, 'Expected default en.');

  ord := ord + 1;
  insert into bb_results values (ord, 'profile policies preserved by exact name',
    case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles'
      and policyname in ('profiles read self or admin', 'profiles update self limited')) = 2
      then 'PASS' else 'FAIL' end, 'Both policies must exist exactly once by name.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps table, RLS and owner policy',
    case when to_regclass('public.coursework_maps') is not null
      and (select c.relrowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relname = 'coursework_maps') is true
      and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coursework_maps'
        and policyname = 'students manage own coursework maps')
    then 'PASS' else 'FAIL' end, 'Table present with RLS enabled and the owner policy.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework student-read policies present',
    case when
      exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coursework_quizzes'
        and policyname = 'students read own coursework quizzes' and cmd = 'SELECT')
      and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coursework_quiz_attempts'
        and policyname = 'students read own coursework quiz attempts' and cmd = 'SELECT')
      and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'theory_certificates'
        and policyname = 'students read own theory certificates' and cmd = 'SELECT')
      and not exists (select 1 from pg_policies where schemaname = 'public'
        and tablename = 'coursework_quiz_answer_keys' and cmd = 'SELECT')
    then 'PASS' else 'FAIL' end, 'Student reads are owner-scoped; answer keys have no API-role read policy.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework_maps.updated_at present',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'coursework_maps' and column_name = 'updated_at')
      then 'PASS' else 'FAIL' end, 'Update timestamp required by the record contract.');

  ord := ord + 1;
  insert into bb_results values (ord, 'all coursework tables present',
    case when to_regclass('public.coursework_maps') is not null
      and to_regclass('public.coursework_quizzes') is not null
      and to_regclass('public.coursework_quiz_answer_keys') is not null
      and to_regclass('public.coursework_quiz_attempts') is not null
      and to_regclass('public.theory_certificates') is not null
    then 'PASS' else 'FAIL' end, 'All five tables from 20261121050000 must exist.');

  ord := ord + 1;
  insert into bb_results values (ord, 'learning-ai prerequisite present',
    case when to_regclass('public.mentor_conversations') is not null
      and to_regclass('public.learning_activity') is not null
      and to_regclass('public.learning_bookmarks') is not null
      and to_regclass('public.student_roadmaps') is not null
    then 'PASS' else 'FAIL' end, 'Apply learning-ai.sql before the coursework migration.');

  ord := ord + 1;
  insert into bb_results values (ord, 'platform notification and company-domain tables present',
    case when to_regclass('public.company_domain_requests') is not null
      and to_regclass('public.company_domains') is not null
      and to_regclass('public.notification_preferences') is not null
      and to_regclass('public.notifications') is not null
      and to_regclass('public.email_outbox') is not null
      and to_regclass('public.email_delivery_logs') is not null
      and to_regclass('public.deadline_reminder_log') is not null
    then 'PASS' else 'FAIL' end, 'All seven tables created by 20261121040000 must exist.');

  ord := ord + 1;
  insert into bb_results values (ord, 'coursework answer keys are not accessible to API roles',
    case
      when to_regclass('public.coursework_quiz_answer_keys') is null then 'FAIL'
      when not has_table_privilege('anon', 'public.coursework_quiz_answer_keys', 'SELECT')
        and not has_table_privilege('authenticated', 'public.coursework_quiz_answer_keys', 'SELECT')
        then 'PASS'
      else 'FAIL'
    end, 'Only the server service role may read answer keys.');

  ord := ord + 1;
  insert into bb_results values (ord, 'authenticated cannot write company verification state',
    case
      when to_regclass('public.companies') is null then 'FAIL'
      when not has_column_privilege('authenticated', 'public.companies', 'verified', 'INSERT')
        and not has_column_privilege('authenticated', 'public.companies', 'verified', 'UPDATE')
        and not has_column_privilege('authenticated', 'public.companies', 'verification_status', 'INSERT')
        and not has_column_privilege('authenticated', 'public.companies', 'verification_status', 'UPDATE')
        and not has_column_privilege('authenticated', 'public.companies', 'owner_user_id', 'UPDATE')
        then 'PASS'
      else 'FAIL'
    end, 'Verification is restricted to the configured administrator workflow.');

  ord := ord + 1;
  insert into bb_results values (ord, 'project workflow RLS and evidence policies',
    case
      when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_assignments'
          and policyname = 'student starts own assignment')
        and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'submissions'
          and policyname = 'assigning company reviews submissions')
        and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'evidence upload for own assignment')
        and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'evidence readable by participants')
        and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'remove unused evidence upload')
        then 'PASS'
      else 'FAIL'
    end, 'Assignment, submission and private evidence policies must exist.');

  ord := ord + 1;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    insert into bb_results values (ord, 'migration history availability', 'INFO',
      'History table is unavailable or not visible; verify object state and retain SQL Editor execution records.');
  else
    insert into bb_results values (ord, 'coursework migration history vs objects', 'INFO',
      'Compare versions 20261121050000/55000 with the table and updated_at checks above; do not edit migration history to hide missing objects.');
  end if;

  ord := ord + 1;
  insert into bb_results values (ord, 'projects.status is public.project_status',
    case when exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'projects' and column_name = 'status'
        and udt_name = 'project_status') then 'PASS' else 'FAIL' end, 'Enum must be preserved.');

  ord := ord + 1;
  execute 'select count(*) from (select slug from public.projects where slug is not null group by slug having count(*) > 1) d' into n;
  insert into bb_results values (ord, 'no duplicate project slugs',
    case when n = 0 then 'PASS' else 'FAIL' end, 'Duplicate slugs: ' || n);

  ord := ord + 1;
  insert into bb_results values (ord, 'project_milestones_project_id_fkey present',
    case when exists (
      select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid join pg_namespace tn on tn.oid = t.relnamespace
      join pg_class r on r.oid = c.confrelid join pg_namespace rn on rn.oid = r.relnamespace
      where c.contype = 'f' and c.conname = 'project_milestones_project_id_fkey'
        and tn.nspname = 'public' and t.relname = 'project_milestones'
        and rn.nspname = 'public' and r.relname = 'projects')
    then 'PASS' else 'FAIL' end, 'Foreign key from project_milestones.project_id to projects.id.');

  ord := ord + 1;
  if to_regclass('public.project_milestones') is null or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'project_milestones' and column_name = 'project_id'
  ) then
    insert into bb_results values (ord, 'no orphaned project_milestones rows', 'FAIL',
      'Cannot check for orphans because project_milestones or its project_id column is missing.');
  else
    execute 'select count(*) from public.project_milestones m where not exists (select 1 from public.projects p where p.id = m.project_id)' into n;
    insert into bb_results values (ord, 'no orphaned project_milestones rows',
      case when n = 0 then 'PASS' else 'FAIL' end, 'Orphaned rows: ' || n);
  end if;

  -- RLS must be enabled on every table the repaired workflow reads or writes.
  for rls_table in select unnest(array['profiles', 'companies', 'projects', 'project_milestones', 'project_assignments',
      'project_assignment_milestones', 'project_milestone_progress', 'submissions', 'certificates',
      'company_certificate_signatories', 'coursework_maps', 'coursework_quizzes',
      'coursework_quiz_answer_keys', 'coursework_quiz_attempts', 'theory_certificates',
      'mentor_conversations', 'learning_activity', 'learning_bookmarks', 'student_roadmaps',
      'company_domain_requests', 'company_domains', 'notification_preferences',
      'notifications', 'email_outbox', 'email_delivery_logs', 'deadline_reminder_log',
      'platform_admin_owner'])
  loop
    ord := ord + 1;
    select c.relrowsecurity into rls
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relname = rls_table;
    insert into bb_results values (ord, 'RLS enabled: ' || rls_table,
      case rls when true then 'PASS' when false then 'FAIL' else 'MISSING' end,
      'Row-level security must remain enabled.');
  end loop;

  ord := ord + 1;
  if to_regclass('public.platform_admin_owner') is null then
    insert into bb_results values (ord, 'platform owner provisioned', 'PENDING', 'Table missing.');
  else
    execute 'select count(*) from public.platform_admin_owner' into n;
    insert into bb_results values (ord, 'platform owner provisioned',
      case when n = 1 then 'PASS' else 'PENDING' end,
      'Rows: ' || n || '. Exactly one is expected after the manual owner provisioning step.');
  end if;
end $$;

select check_name, status, detail from bb_results order by ord;

notify pgrst, 'reload schema';
