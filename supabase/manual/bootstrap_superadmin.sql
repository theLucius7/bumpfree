-- EXPLICIT ONE-TIME SUPERADMIN BOOTSTRAP.
--
-- Run this file only as postgres (for example in Supabase SQL Editor). Replace
-- exactly one of the two placeholders below and leave the other untouched.
-- The target must already exist in both auth.users and public.profiles. This
-- script never guesses that the first/oldest registered account is trusted.

begin;

do $$
declare
  target_email text := 'REPLACE_WITH_USER_EMAIL';
  target_user_id_text text := 'REPLACE_WITH_USER_UUID';
  target_user_id uuid;
  matched_users integer;
begin
  if target_email <> 'REPLACE_WITH_USER_EMAIL'
     and target_user_id_text <> 'REPLACE_WITH_USER_UUID' then
    raise exception 'Set either target_email or target_user_id_text, not both';
  end if;

  if target_email <> 'REPLACE_WITH_USER_EMAIL' then
    if pg_catalog.btrim(target_email) = '' then
      raise exception 'Target email must not be empty';
    end if;

    select pg_catalog.count(*),
           (pg_catalog.array_agg(auth_user.id order by auth_user.id))[1]
    into matched_users, target_user_id
    from auth.users auth_user
    where pg_catalog.lower(auth_user.email) = pg_catalog.lower(pg_catalog.btrim(target_email));
  elsif target_user_id_text <> 'REPLACE_WITH_USER_UUID' then
    begin
      target_user_id := pg_catalog.btrim(target_user_id_text)::uuid;
    exception when invalid_text_representation then
      raise exception 'Target UUID is invalid';
    end;

    select pg_catalog.count(*)
    into matched_users
    from auth.users auth_user
    where auth_user.id = target_user_id;
  else
    raise exception 'Replace exactly one target placeholder before running this script';
  end if;

  if matched_users <> 1 then
    raise exception 'Expected exactly one matching auth user, found %', matched_users;
  end if;

  update public.profiles profile
  set role = 'superadmin'
  where profile.id = target_user_id;

  if not found then
    raise exception 'The matching auth user has no public.profiles row';
  end if;

  raise notice 'Granted superadmin to user %', target_user_id;
end
$$;

commit;
