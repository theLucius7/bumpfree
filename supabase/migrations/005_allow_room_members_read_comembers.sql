-- Room-member visibility helpers must exist for both fresh installations and
-- databases where migrations 001-003 were already applied before this file
-- was introduced.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_room_member_sd(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members membership
    where membership.room_id = check_room_id
      and membership.user_id = auth.uid()
  )
$$;

create or replace function private.is_room_admin_or_public_sd(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms room
    where room.id = check_room_id
      and (
        room.admin_id = auth.uid()
        or (
          room.is_public = true
          and (room.expires_at is null or room.expires_at > pg_catalog.now())
        )
      )
  )
$$;

revoke all on function private.is_room_member_sd(uuid) from public;
revoke all on function private.is_room_admin_or_public_sd(uuid) from public;
grant execute on function private.is_room_member_sd(uuid) to authenticated;
grant execute on function private.is_room_admin_or_public_sd(uuid) to anon, authenticated;

drop policy if exists "room_members_select" on public.room_members;
create policy "room_members_select" on public.room_members for select using (
  auth.uid() = user_id
  or private.is_room_member_sd(room_id)
  or private.is_room_admin_or_public_sd(room_id)
);
