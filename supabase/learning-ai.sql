-- BuildBridge learning history and private AI Mentor conversations.
-- Run after database-schema.sql and supabase/auth-setup-repair.sql.

create table if not exists public.learning_activity (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  video_id text,
  title text not null,
  channel text,
  thumbnail text,
  topic text,
  action text not null check (action in ('opened', 'completed')),
  created_at timestamptz not null default now()
);

alter table public.learning_activity alter column video_id drop not null;

create index if not exists learning_activity_student_created
  on public.learning_activity(student_user_id, created_at desc);

create table if not exists public.learning_bookmarks (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  video_id text not null,
  title text not null,
  channel text,
  thumbnail text,
  topic text,
  created_at timestamptz not null default now(),
  unique (student_user_id, video_id)
);

create table if not exists public.mentor_conversations (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  page_context text not null default 'Dashboard',
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mentor_conversations_student_updated
  on public.mentor_conversations(student_user_id, updated_at desc);

create table if not exists public.mentor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.mentor_conversations(id) on delete cascade,
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create table if not exists public.student_roadmaps (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references public.profiles(id) on delete cascade,
  career_goal text not null,
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  updated_at timestamptz not null default now(),
  unique (student_user_id, career_goal)
);

create index if not exists mentor_messages_conversation_created
  on public.mentor_messages(conversation_id, created_at);

alter table public.learning_activity enable row level security;
alter table public.learning_bookmarks enable row level security;
alter table public.mentor_conversations enable row level security;
alter table public.mentor_messages enable row level security;
alter table public.student_roadmaps enable row level security;

drop policy if exists "students read own learning activity" on public.learning_activity;
create policy "students read own learning activity" on public.learning_activity
  for select to authenticated using (student_user_id = auth.uid());
drop policy if exists "students add own learning activity" on public.learning_activity;
create policy "students add own learning activity" on public.learning_activity
  for insert to authenticated with check (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
  );

drop policy if exists "students manage own bookmarks" on public.learning_bookmarks;
create policy "students manage own bookmarks" on public.learning_bookmarks
  for all to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
  with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);

drop policy if exists "students manage own mentor conversations" on public.mentor_conversations;
create policy "students manage own mentor conversations" on public.mentor_conversations
  for all to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
  with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);

drop policy if exists "students read own mentor messages" on public.mentor_messages;
create policy "students read own mentor messages" on public.mentor_messages
  for select to authenticated using (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id and c.student_user_id = auth.uid()
    )
  );
drop policy if exists "students add own mentor messages" on public.mentor_messages;
create policy "students add own mentor messages" on public.mentor_messages
  for insert to authenticated with check (
    student_user_id = auth.uid()
    and public.current_user_role() = 'student'::public.app_role
    and exists (
      select 1 from public.mentor_conversations c
      where c.id = conversation_id and c.student_user_id = auth.uid()
    )
  );

drop policy if exists "students manage own roadmaps" on public.student_roadmaps;
create policy "students manage own roadmaps" on public.student_roadmaps
  for all to authenticated
  using (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role)
  with check (student_user_id = auth.uid() and public.current_user_role() = 'student'::public.app_role);

grant select, insert on public.learning_activity to authenticated;
grant select, insert, delete on public.learning_bookmarks to authenticated;
grant select, insert, update on public.mentor_conversations to authenticated;
grant select, insert on public.mentor_messages to authenticated;
grant select, insert, update on public.student_roadmaps to authenticated;
