begin;

-- Additive profile expansion: existing profile/auth fields are retained.
alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists location text,
  add column if not exists degree text,
  add column if not exists department text,
  add column if not exists academic_year text,
  add column if not exists graduation_year integer,
  add column if not exists cgpa numeric(5,2),
  add column if not exists coursework text[] not null default '{}',
  add column if not exists linkedin_url text,
  add column if not exists github_url text,
  add column if not exists portfolio_url text,
  add column if not exists resume_url text;

-- Capture an optional validated phone number for email/password and OAuth
-- registrations. Public metadata never determines an elevated account role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  display_name text;
  supplied_phone text;
begin
  display_name := left(coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), '')
  ), 120);
  supplied_phone := nullif(trim(new.raw_user_meta_data->>'phone_number'), '');
  if supplied_phone is not null and supplied_phone !~ '^\+[1-9][0-9]{7,14}$' then
    supplied_phone := null;
  end if;

  insert into public.profiles(id, email, full_name, role, phone_number, preferred_language)
  values(new.id, new.email, display_name, 'student'::public.app_role, supplied_phone, 'en')
  on conflict(id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number);
  return new;
end;
$$;

-- Keep the self-repair path consistent with the auth trigger and preserve any
-- role already provisioned by the trusted administrator workflow.
create or replace function public.ensure_my_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  auth_user auth.users;
  result_profile public.profiles;
  display_name text;
  supplied_phone text;
begin
  select * into auth_user from auth.users where id = auth.uid();
  if auth_user.id is null then
    raise exception 'No authenticated user was found.';
  end if;

  display_name := left(coalesce(
    nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data->>'name'), '')
  ), 120);
  supplied_phone := nullif(trim(auth_user.raw_user_meta_data->>'phone_number'), '');
  if supplied_phone is not null and supplied_phone !~ '^\+[1-9][0-9]{7,14}$' then
    supplied_phone := null;
  end if;

  insert into public.profiles(id, email, full_name, role, phone_number, preferred_language)
  values(auth_user.id, auth_user.email, display_name, 'student'::public.app_role, supplied_phone, 'en')
  on conflict(id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number)
  returning * into result_profile;
  return result_profile;
end;
$$;
revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;



-- Structured eligibility signals make opportunity recommendations explainable.
alter table public.opportunities
  add column if not exists required_skills text[] not null default '{}',
  add column if not exists career_goals text[] not null default '{}',
  add column if not exists experience_level text,
  add column if not exists location text,
  add column if not exists is_remote boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "verified companies update own opportunities" on public.opportunities;
create policy "verified companies update own opportunities" on public.opportunities
  for update to authenticated
  using (
    created_by = auth.uid()
    and exists (select 1 from public.companies c where c.owner_user_id = auth.uid() and c.verified = true)
    or public.is_platform_admin()
  )
  with check (
    (created_by = auth.uid() and exists (select 1 from public.companies c where c.owner_user_id = auth.uid() and c.verified = true))
    or public.is_platform_admin()
  );

-- Coursework-first learning: retain only the structured analysis, never the
-- uploaded raw syllabus or assignment file.
create table if not exists public.coursework_maps (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  source_file_name text not null,
  course_name text not null,
  career_goal text not null,
  summary text not null default '',
  concepts jsonb not null default '[]'::jsonb check (jsonb_typeof(concepts) = 'array'),
  mapped_skills jsonb not null default '[]'::jsonb check (jsonb_typeof(mapped_skills) = 'array'),
  project_suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(project_suggestions) = 'array'),
  created_at timestamptz not null default now()
);
create index if not exists coursework_maps_student_created_idx
  on public.coursework_maps(student_user_id, created_at desc);
alter table public.coursework_maps enable row level security;
drop policy if exists "students manage own coursework maps" on public.coursework_maps;
create policy "students manage own coursework maps" on public.coursework_maps
  for all to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
  with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);
revoke all on public.coursework_maps from anon, authenticated;
grant select, insert, delete on public.coursework_maps to authenticated;


-- Theory knowledge checks and their credentials remain separate from project
-- evidence and company-authorized completion certificates.
create table if not exists public.coursework_quizzes (
  id uuid primary key default gen_random_uuid(),
  coursework_map_id uuid not null references public.coursework_maps(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  course_name text not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 4 and 8),
  created_at timestamptz not null default now(),
  unique(coursework_map_id)
);
create index if not exists coursework_quizzes_student_created_idx
  on public.coursework_quizzes(student_user_id, created_at desc);
alter table public.coursework_quizzes enable row level security;
drop policy if exists "students read own coursework quizzes" on public.coursework_quizzes;
create policy "students read own coursework quizzes" on public.coursework_quizzes
  for select to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);
revoke all on public.coursework_quizzes from anon, authenticated;
grant select on public.coursework_quizzes to authenticated;

create table if not exists public.coursework_quiz_answer_keys (
  quiz_id uuid primary key references public.coursework_quizzes(id) on delete cascade,
  correct_indexes jsonb not null check (jsonb_typeof(correct_indexes) = 'array'),
  explanations jsonb not null default '[]'::jsonb check (jsonb_typeof(explanations) = 'array'),
  created_at timestamptz not null default now()
);
alter table public.coursework_quiz_answer_keys enable row level security;
revoke all on public.coursework_quiz_answer_keys from anon, authenticated;

create table if not exists public.coursework_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.coursework_quizzes(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  selected_indexes jsonb not null check (jsonb_typeof(selected_indexes) = 'array'),
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  passed boolean not null default false,
  feedback jsonb not null default '[]'::jsonb check (jsonb_typeof(feedback) = 'array'),
  attempted_at timestamptz not null default now()
);
create index if not exists coursework_quiz_attempts_student_idx
  on public.coursework_quiz_attempts(student_user_id, attempted_at desc);
alter table public.coursework_quiz_attempts enable row level security;
drop policy if exists "students read own coursework quiz attempts" on public.coursework_quiz_attempts;
create policy "students read own coursework quiz attempts" on public.coursework_quiz_attempts
  for select to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);
revoke all on public.coursework_quiz_attempts from anon, authenticated;
grant select on public.coursework_quiz_attempts to authenticated;

create table if not exists public.theory_certificates (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.coursework_quizzes(id) on delete cascade,
  coursework_map_id uuid not null references public.coursework_maps(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  course_name text not null,
  recipient_name text not null,
  certificate_code text not null unique check (certificate_code ~ '^BBT-[A-F0-9]{16}$'),
  score numeric(5,2) not null check (score >= 80 and score <= 100),
  issued_at timestamptz not null default now(),
  unique(quiz_id, student_user_id)
);
create index if not exists theory_certificates_student_issued_idx
  on public.theory_certificates(student_user_id, issued_at desc);
alter table public.theory_certificates enable row level security;
drop policy if exists "students read own theory certificates" on public.theory_certificates;
create policy "students read own theory certificates" on public.theory_certificates
  for select to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);
revoke all on public.theory_certificates from anon, authenticated;
grant select on public.theory_certificates to authenticated;

grant all on public.coursework_maps, public.coursework_quizzes, public.coursework_quiz_answer_keys, public.coursework_quiz_attempts, public.theory_certificates to service_role;


create or replace function public.verify_theory_certificate(certificate_code_input text)
returns table (
  certificate_id uuid,
  certificate_code text,
  recipient_name text,
  course_name text,
  score numeric,
  issued_at timestamptz,
  credential_type text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select c.id, c.certificate_code, c.recipient_name, c.course_name, c.score, c.issued_at, 'theory_learning_completion'::text
  from public.theory_certificates c
  where upper(c.certificate_code) = upper(certificate_code_input)
  limit 1;
$$;
revoke all on function public.verify_theory_certificate(text) from public;
grant execute on function public.verify_theory_certificate(text) to anon, authenticated;

-- The authenticated user can remove only their own mentor conversations. The
-- existing RLS policy scopes DELETE to that user's rows; messages cascade.
grant delete on public.mentor_conversations to authenticated;

commit;

notify pgrst, 'reload schema';
