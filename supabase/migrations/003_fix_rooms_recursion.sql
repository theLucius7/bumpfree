-- Drop recursive policies
drop policy if exists "rooms_select_member_or_public" on public.rooms;
drop policy if exists "room_members_select" on public.room_members;

-- Create Security Definer helper functions to break RLS recursion cycles
create or replace function public.is_room_member_sd(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_room_member_sd(check_room_id) $$;

create or replace function public.is_room_admin_or_public_sd(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_room_admin_or_public_sd(check_room_id) $$;

revoke all on function public.is_room_member_sd(uuid) from public;
revoke all on function public.is_room_admin_or_public_sd(uuid) from public;
grant execute on function public.is_room_member_sd(uuid) to authenticated;
grant execute on function public.is_room_admin_or_public_sd(uuid) to anon, authenticated;

-- Recreate policies using the SD functions
create policy "rooms_select_member_or_public" on public.rooms for select using (
  (is_public = true and (expires_at is null or expires_at > pg_catalog.now()))
  or admin_id = auth.uid()
  or public.is_room_member_sd(id)
);

create policy "room_members_select" on public.room_members for select using (
  auth.uid() = user_id
  or public.is_room_admin_or_public_sd(room_id)
);
