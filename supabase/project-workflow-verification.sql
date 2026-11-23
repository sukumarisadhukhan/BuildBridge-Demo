-- Read-only checks for the assignment/milestone workflow.
-- Run only after all documented marketplace and certificate migrations.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'projects',
    'project_milestones',
    'project_assignments',
    'project_assignment_milestones',
    'project_milestone_progress',
    'submissions',
    'certificates'
  )
order by c.relname;

select
  conrelid::regclass as table_name,
  conname as constraint_name,
  confrelid::regclass as referenced_table,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.projects'::regclass,
  'public.project_milestones'::regclass,
  'public.project_assignments'::regclass,
  'public.project_assignment_milestones'::regclass,
  'public.submissions'::regclass,
  'public.certificates'::regclass
)
and contype = 'f'
order by conrelid::regclass::text, conname;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in (
    'projects',
    'project_milestones',
    'project_assignments',
    'project_assignment_milestones',
    'project_milestone_progress',
    'submissions',
    'certificates'
  )
order by tablename, policyname;

select 'assignments_missing_milestone_state' as check_name, count(*) as row_count
from public.project_assignments a
where exists (
  select 1 from public.project_milestones m where m.project_id = a.project_id
)
and not exists (
  select 1 from public.project_assignment_milestones pm
  where pm.assignment_id = a.id
)
union all
select 'company_assignments_missing_attribution', count(*)
from public.project_assignments a
join public.projects p on p.id = a.project_id and p.project_source = 'company'
where a.company_id is null
   or a.company_user_id is distinct from p.company_user_id
union all
select 'current_milestone_submissions_without_matching_state', count(*)
from public.project_assignment_milestones pm
left join public.submissions s
  on s.id = pm.submission_id
 and s.assignment_id = pm.assignment_id
 and s.milestone_id = pm.milestone_id
where pm.submission_id is not null
  and s.id is null
union all
select 'legacy_unverified_not_revoked', count(*)
from public.certificates
where certificate_type = 'legacy_unverified'
  and certificate_status <> 'revoked';

select
  p.project_source,
  pm.status as milestone_status,
  count(*) as milestone_count
from public.project_assignment_milestones pm
join public.project_assignments a on a.id = pm.assignment_id
join public.projects p on p.id = a.project_id
group by p.project_source, pm.status
order by p.project_source, pm.status;
