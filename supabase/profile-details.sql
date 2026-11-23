-- BuildBridge profile details migration.
-- Run once in Supabase SQL Editor after database-schema.sql.
-- Safe to re-run when checking or repairing an existing project.

alter table public.profiles add column if not exists phone_number text;
alter table public.profiles add column if not exists avatar_path text;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_profile_email();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "profile avatars owner read" on storage.objects;
create policy "profile avatars owner read" on storage.objects
for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile avatars owner upload" on storage.objects;
create policy "profile avatars owner upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile avatars owner delete" on storage.objects;
create policy "profile avatars owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
