-- Replace with the deployer's exact, confirmed Supabase Auth email.
-- Run only as the Supabase project owner after applying the platform identity migration.
do $$
declare
  selected_owner public.profiles;
  auth_owner auth.users;
begin
  select * into selected_owner
  from public.profiles
  where lower(email) = lower('YOUR_DEPLOYER_EMAIL@example.com');

  if selected_owner.id is null then
    raise exception 'No BuildBridge profile matches the configured deployer email.';
  end if;
  select * into auth_owner from auth.users where id = selected_owner.id;
  if auth_owner.email_confirmed_at is null
    or lower(auth_owner.email) <> lower('YOUR_DEPLOYER_EMAIL@example.com') then
    raise exception 'The deployer account email must be confirmed and match the configured owner email.';
  end if;

  update public.profiles
  set role = 'student'
  where role = 'admin' and id <> selected_owner.id;

  update public.profiles set role = 'admin' where id = selected_owner.id;

  insert into public.platform_admin_owner(singleton, owner_user_id, owner_email, updated_at)
  values (true, selected_owner.id, selected_owner.email, now())
  on conflict (singleton) do update
    set owner_user_id = excluded.owner_user_id,
        owner_email = excluded.owner_email,
        updated_at = now();
end
$$;

select id, email, role
from public.profiles
where role = 'admin';
