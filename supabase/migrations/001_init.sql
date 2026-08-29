-- ============================================================
-- BumpFree 完整初始化 SQL（修正版）
-- 请在 Supabase SQL Editor 中全选并执行
-- ============================================================

-- ============================================================
-- 1. Profiles table
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user', 'superadmin')),
  room_quota int not null default 3 check (room_quota between 0 and 100),
  schedule_quota int not null default 3 check (schedule_quota between 0 and 100),
  created_at timestamptz not null default now()
);

-- Auto-create an ordinary profile. Administrator bootstrap is an explicit
-- operator action in supabase/manual/bootstrap_superadmin.sql; public signup
-- must never grant privileged access based on registration order.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, new.raw_user_meta_data ->> 'display_name', 'user')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;

-- ============================================================
-- 1.5 Backfill existing users (if any) into profiles
-- This prevents foreign key errors if tables were dropped but auth.users remained
-- ============================================================
insert into public.profiles (id, display_name, role)
select
  auth_user.id,
  auth_user.raw_user_meta_data ->> 'display_name',
  'user'
from auth.users auth_user
on conflict (id) do nothing;

-- Existing role values are preserved by ON CONFLICT. A fresh database has no
-- superadmin until an operator runs the explicit manual bootstrap script.

-- ============================================================
-- 2. Schedules
-- ============================================================
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  semester_tag text not null check (char_length(semester_tag) between 1 and 80),
  school text check (school is null or char_length(school) <= 160),
  start_date date not null,
  max_weeks int not null default 20 check (max_weeks between 1 and 30),
  is_active bool not null default true,
  wakeup_raw jsonb,
  imported_at timestamptz not null default now(),
  unique (user_id, semester_tag),
  unique (id, user_id)
);

-- ============================================================
-- 3. Courses
-- ============================================================
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  room text check (room is null or char_length(room) <= 200),
  teacher text check (teacher is null or char_length(teacher) <= 120),
  day_of_week int not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  start_week int not null default 1 check (start_week between 1 and 30),
  end_week int not null default 20 check (end_week between 1 and 30 and end_week >= start_week),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  check (end_time > start_time),
  constraint courses_schedule_owner_fkey foreign key (schedule_id, user_id)
    references public.schedules(id, user_id)
    on delete cascade
);

create index if not exists courses_schedule_owner_idx
  on public.courses (schedule_id, user_id);

-- ============================================================
-- 4. Rooms
-- ============================================================
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  expires_at timestamptz,
  is_public bool default false,
  created_at timestamptz default now()
);

create index if not exists rooms_admin_id_idx on public.rooms (admin_id);

-- ============================================================
-- 5. Room Members
-- ============================================================
create table if not exists public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  color text not null,
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_room_idx
  on public.room_members (user_id, room_id);

-- ============================================================
-- 6. Invitations
-- ============================================================
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  inviter_id uuid references public.profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now()
);

-- ============================================================
-- 7. Enable RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.courses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.invitations enable row level security;

-- ============================================================
-- 8. Security-definer helpers
-- ============================================================
-- Keep policy helpers outside the exposed API schema. Every definer function
-- uses an empty search_path and fully-qualified relation names.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_superadmin(check_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.id = check_user_id
      and profile.role = 'superadmin'
  )
$$;

create or replace function private.is_room_co_member(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_members own_membership
    join public.room_members target_membership
      on target_membership.room_id = own_membership.room_id
    where own_membership.user_id = auth.uid()
      and target_membership.user_id = target_user_id
  )
$$;

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

create or replace function private.can_manage_room(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_superadmin(auth.uid())
    or exists (
      select 1
      from public.rooms room
      where room.id = check_room_id
        and room.admin_id = auth.uid()
    )
$$;

create or replace function private.is_room_owner(check_room_id uuid)
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
      and room.admin_id = auth.uid()
  )
$$;

create or replace function private.has_pending_room_invitation(check_room_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.invitations invitation
    where invitation.room_id = check_room_id
      and invitation.invitee_id = auth.uid()
      and invitation.status = 'pending'
  )
$$;

-- Compatibility wrappers for older policies and application code.
create or replace function public.is_room_co_member(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_room_co_member(target_user_id) $$;

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

revoke all on function private.is_superadmin(uuid) from public;
revoke all on function private.is_room_co_member(uuid) from public;
revoke all on function private.is_room_member_sd(uuid) from public;
revoke all on function private.is_room_admin_or_public_sd(uuid) from public;
revoke all on function private.can_manage_room(uuid) from public;
revoke all on function private.is_room_owner(uuid) from public;
revoke all on function private.has_pending_room_invitation(uuid) from public;
revoke all on function public.is_room_co_member(uuid) from public;
revoke all on function public.is_room_member_sd(uuid) from public;
revoke all on function public.is_room_admin_or_public_sd(uuid) from public;

grant execute on function private.is_superadmin(uuid) to authenticated;
grant execute on function private.is_room_co_member(uuid) to authenticated;
grant execute on function private.is_room_member_sd(uuid) to authenticated;
grant execute on function private.is_room_admin_or_public_sd(uuid) to anon, authenticated;
grant execute on function private.can_manage_room(uuid) to authenticated;
grant execute on function private.is_room_owner(uuid) to authenticated;
grant execute on function private.has_pending_room_invitation(uuid) to authenticated;
grant execute on function public.is_room_co_member(uuid) to authenticated;
grant execute on function public.is_room_member_sd(uuid) to authenticated;
grant execute on function public.is_room_admin_or_public_sd(uuid) to anon, authenticated;

create or replace function private.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null
     or private.is_superadmin(actor_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.room_quota := 3;
    new.schedule_quota := 3;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.room_quota is distinct from old.room_quota
     or new.schedule_quota is distinct from old.schedule_quota then
    raise exception 'Only a superadmin may change profile role or quota'
      using errcode = '42501';
  end if;

  return new;
end
$$;

revoke all on function private.protect_profile_privileged_fields() from public;
drop trigger if exists protect_profile_privileged_fields on public.profiles;
create trigger protect_profile_privileged_fields
  before insert or update on public.profiles
  for each row execute function private.protect_profile_privileged_fields();

-- ============================================================
-- 9. RLS Policies
-- ============================================================

-- Profiles: public lookup remains available, but the trigger above makes
-- role/quota immutable to non-admin users.
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert
  with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "profiles_update_admin" on public.profiles for update
  using (private.is_superadmin(auth.uid()))
  with check (private.is_superadmin(auth.uid()) or auth.uid() = id);

-- Schedules: owner full access; room co-members can read (via security definer)
drop policy if exists "schedules_select_own" on public.schedules;
drop policy if exists "schedules_select_room_member" on public.schedules;
drop policy if exists "schedules_insert_own" on public.schedules;
drop policy if exists "schedules_update_own" on public.schedules;
drop policy if exists "schedules_delete_own" on public.schedules;
create policy "schedules_select_own" on public.schedules for select using (auth.uid() = user_id);
create policy "schedules_select_room_member" on public.schedules for select using (
  private.is_room_co_member(user_id)
);
create policy "schedules_insert_own" on public.schedules for insert with check (auth.uid() = user_id);
create policy "schedules_update_own" on public.schedules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "schedules_delete_own" on public.schedules for delete using (auth.uid() = user_id);

-- Courses: owner full access; room co-members can read
drop policy if exists "courses_select_own" on public.courses;
drop policy if exists "courses_select_room_member" on public.courses;
drop policy if exists "courses_insert_own" on public.courses;
drop policy if exists "courses_update_own" on public.courses;
drop policy if exists "courses_delete_own" on public.courses;
create policy "courses_select_own" on public.courses for select using (auth.uid() = user_id);
create policy "courses_select_room_member" on public.courses for select using (
  private.is_room_co_member(user_id)
);
create policy "courses_insert_own" on public.courses for insert with check (auth.uid() = user_id);
create policy "courses_update_own" on public.courses for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "courses_delete_own" on public.courses for delete using (auth.uid() = user_id);

-- Rooms: admin full CRUD; members and public can read
drop policy if exists "rooms_select_member_or_public" on public.rooms;
drop policy if exists "rooms_insert_own" on public.rooms;
drop policy if exists "rooms_update_admin" on public.rooms;
drop policy if exists "rooms_delete_admin" on public.rooms;
create policy "rooms_select_member_or_public" on public.rooms for select using (
  (is_public = true and (expires_at is null or expires_at > pg_catalog.now()))
  or admin_id = auth.uid()
  or private.is_room_member_sd(id)
);
create policy "rooms_insert_own" on public.rooms for insert with check (auth.uid() = admin_id);
create policy "rooms_update_admin" on public.rooms for update
  using (auth.uid() = admin_id)
  with check (auth.uid() = admin_id);
create policy "rooms_delete_admin" on public.rooms for delete using (auth.uid() = admin_id);

-- Room Members: cross-table check uses SD function to avoid recursion
drop policy if exists "room_members_select" on public.room_members;
drop policy if exists "room_members_insert" on public.room_members;
drop policy if exists "room_members_delete" on public.room_members;
create policy "room_members_select" on public.room_members for select using (
  auth.uid() = user_id
  or private.is_room_admin_or_public_sd(room_id)
);
create policy "room_members_insert" on public.room_members for insert with check (
  auth.uid() = user_id
  and (
    private.is_room_owner(room_id)
    or private.has_pending_room_invitation(room_id)
  )
);
create policy "room_members_delete" on public.room_members for delete using (
  auth.uid() = user_id
  or private.can_manage_room(room_id)
);

-- Invitations
drop policy if exists "invitations_select" on public.invitations;
drop policy if exists "invitations_insert" on public.invitations;
drop policy if exists "invitations_update_invitee" on public.invitations;
create policy "invitations_select" on public.invitations for select using (
  auth.uid() = invitee_id or auth.uid() = inviter_id
);
create policy "invitations_insert" on public.invitations for insert with check (
  auth.uid() = inviter_id
  and private.can_manage_room(room_id)
);
create policy "invitations_update_invitee" on public.invitations for update
  using (auth.uid() = invitee_id)
  with check (auth.uid() = invitee_id);
