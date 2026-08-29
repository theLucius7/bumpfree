-- Security hardening for both upgraded and freshly-created databases.
-- This migration is intentionally additive/idempotent and never reassigns an
-- existing superadmin role.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

-- --------------------------------------------------------------------------
-- Profiles: add the missing quota column, normalize legacy nulls/outliers,
-- and make privileged fields immutable to ordinary users at the DB boundary.
-- --------------------------------------------------------------------------
alter table public.profiles
  add column if not exists schedule_quota int;

update public.profiles
set role = 'user'
where role is null or role not in ('user', 'superadmin');

update public.profiles
set room_quota = greatest(0, least(100, coalesce(room_quota, 3))),
    schedule_quota = greatest(0, least(100, coalesce(schedule_quota, 3)));

alter table public.profiles
  alter column role set default 'user',
  alter column role set not null,
  alter column room_quota set default 3,
  alter column room_quota set not null,
  alter column schedule_quota set default 3,
  alter column schedule_quota set not null,
  alter column created_at set default now();

do $$
begin
  alter table public.profiles
    add constraint profiles_room_quota_bounds
    check (room_quota between 0 and 100);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.profiles
    add constraint profiles_schedule_quota_bounds
    check (schedule_quota between 0 and 100);
exception when duplicate_object then null;
end
$$;

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

create or replace function private.is_invitation_related(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.invitations invitation
    where (
      (invitation.invitee_id = auth.uid() and invitation.inviter_id = target_user_id)
      or (invitation.inviter_id = auth.uid() and invitation.invitee_id = target_user_id)
    )
      and invitation.status = 'pending'
  )
$$;

revoke all on function private.is_superadmin(uuid) from public;
revoke all on function private.is_room_co_member(uuid) from public;
revoke all on function private.is_room_member_sd(uuid) from public;
revoke all on function private.is_room_admin_or_public_sd(uuid) from public;
revoke all on function private.can_manage_room(uuid) from public;
revoke all on function private.is_room_owner(uuid) from public;
revoke all on function private.has_pending_room_invitation(uuid) from public;
revoke all on function private.is_invitation_related(uuid) from public;

grant execute on function private.is_superadmin(uuid) to authenticated;
grant execute on function private.is_room_co_member(uuid) to authenticated;
grant execute on function private.is_room_member_sd(uuid) to authenticated;
grant execute on function private.is_room_admin_or_public_sd(uuid) to anon, authenticated;
grant execute on function private.can_manage_room(uuid) to authenticated;
grant execute on function private.is_room_owner(uuid) to authenticated;
grant execute on function private.has_pending_room_invitation(uuid) to authenticated;
grant execute on function private.is_invitation_related(uuid) to authenticated;

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

drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_select_authorized" on public.profiles;
create policy "profiles_select_authorized" on public.profiles for select to authenticated using (
  auth.uid() = id
  or private.is_superadmin(auth.uid())
  or private.is_room_co_member(id)
  or private.is_invitation_related(id)
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (private.is_superadmin(auth.uid()))
  with check (private.is_superadmin(auth.uid()) or auth.uid() = id);

create or replace function public.search_profiles(p_query text)
returns table (id uuid, display_name text)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_query text := pg_catalog.btrim(coalesce(p_query, ''));
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(normalized_query) < 2 or char_length(normalized_query) > 50 then
    raise exception 'Search query must contain between 2 and 50 characters'
      using errcode = '22023';
  end if;

  return query
  select profile.id, profile.display_name
  from public.profiles profile
  where profile.id <> actor_id
    and pg_catalog.strpos(
      pg_catalog.lower(coalesce(profile.display_name, '')),
      pg_catalog.lower(normalized_query)
    ) > 0
  order by profile.display_name asc nulls last, profile.id asc
  limit 20;
end
$$;

revoke all on function public.search_profiles(text) from public;
revoke all on function public.search_profiles(text) from anon;
grant execute on function public.search_profiles(text) to authenticated;

-- Never derive administrator privileges from signup order. Replacing the
-- legacy trigger function changes future signups only; existing profile roles
-- (including every existing superadmin) remain untouched.
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
end
$$;

revoke all on function public.handle_new_user() from public;

-- Keep compatibility functions safe even on installations whose old 003/004
-- migrations created them with a mutable search_path and PUBLIC execute.
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

revoke all on function public.is_room_co_member(uuid) from public;
revoke all on function public.is_room_member_sd(uuid) from public;
revoke all on function public.is_room_admin_or_public_sd(uuid) from public;
grant execute on function public.is_room_co_member(uuid) to authenticated;
grant execute on function public.is_room_member_sd(uuid) to authenticated;
grant execute on function public.is_room_admin_or_public_sd(uuid) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Legacy-data repair and schedule/course ownership integrity. Rows that
-- cannot be repaired without inventing semantic data are copied into a
-- private quarantine before removal.
-- --------------------------------------------------------------------------
create table if not exists private.security_quarantine (
  entity_type text not null,
  entity_id uuid not null,
  reason text not null,
  payload jsonb not null,
  quarantined_at timestamptz not null default now(),
  primary key (entity_type, entity_id, reason)
);

revoke all on table private.security_quarantine from public, anon, authenticated;

insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'course', course.id, 'invalid_course_removed', pg_catalog.to_jsonb(course)
from public.courses course
where course.schedule_id is null
   or course.day_of_week not between 1 and 7
   or course.start_time is null
   or course.end_time is null
   or course.end_time <= course.start_time
   or course.start_week is null
   or course.end_week is null
   or course.start_week not between 1 and 30
   or course.end_week not between 1 and 30
   or course.end_week < course.start_week
   or not exists (
     select 1
     from public.schedules schedule
     where schedule.id = course.schedule_id
       and schedule.user_id is not null
   )
on conflict (entity_type, entity_id, reason) do nothing;

delete from public.courses course
where course.schedule_id is null
   or course.day_of_week not between 1 and 7
   or course.start_time is null
   or course.end_time is null
   or course.end_time <= course.start_time
   or course.start_week is null
   or course.end_week is null
   or course.start_week not between 1 and 30
   or course.end_week not between 1 and 30
   or course.end_week < course.start_week
   or not exists (
     select 1
     from public.schedules schedule
     where schedule.id = course.schedule_id
       and schedule.user_id is not null
   );

insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'schedule', schedule.id, 'ownerless_schedule_removed', pg_catalog.to_jsonb(schedule)
from public.schedules schedule
where schedule.user_id is null
on conflict (entity_type, entity_id, reason) do nothing;

delete from public.schedules schedule where schedule.user_id is null;

insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'course', course.id, 'course_owner_repaired', pg_catalog.to_jsonb(course)
from public.courses course
join public.schedules schedule on schedule.id = course.schedule_id
where course.user_id is distinct from schedule.user_id
on conflict (entity_type, entity_id, reason) do nothing;

update public.courses course
set user_id = schedule.user_id
from public.schedules schedule
where schedule.id = course.schedule_id
  and course.user_id is distinct from schedule.user_id;

update public.schedules schedule
set semester_tag = case
      when pg_catalog.btrim(coalesce(schedule.semester_tag, '')) = ''
        then 'Imported ' || schedule.id::text
      when char_length(pg_catalog.btrim(schedule.semester_tag)) > 80
        then pg_catalog.left(pg_catalog.btrim(schedule.semester_tag), 43) || ' ' || schedule.id::text
      else pg_catalog.btrim(schedule.semester_tag)
    end,
    school = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(schedule.school, '')), 160), ''),
    max_weeks = greatest(1, least(30, coalesce(schedule.max_weeks, 20))),
    is_active = coalesce(schedule.is_active, false),
    imported_at = coalesce(schedule.imported_at, pg_catalog.now());

update public.schedules schedule
set max_weeks = greatest(schedule.max_weeks, course_weeks.last_week)
from (
  select course.schedule_id, pg_catalog.max(course.end_week) as last_week
  from public.courses course
  group by course.schedule_id
) course_weeks
where schedule.id = course_weeks.schedule_id
  and course_weeks.last_week > schedule.max_weeks;

update public.courses course
set name = case
      when pg_catalog.btrim(coalesce(course.name, '')) = ''
        then 'Untitled course ' || course.id::text
      when char_length(pg_catalog.btrim(course.name)) > 200
        then pg_catalog.left(pg_catalog.btrim(course.name), 163) || ' ' || course.id::text
      else pg_catalog.btrim(course.name)
    end,
    room = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(course.room, '')), 200), ''),
    teacher = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(course.teacher, '')), 120), ''),
    color = case
      when course.color ~ '^#[0-9a-fA-F]{6}$' then pg_catalog.lower(course.color)
      else null
    end,
    created_at = coalesce(course.created_at, pg_catalog.now());

alter table public.schedules
  alter column user_id set not null,
  alter column semester_tag set not null,
  alter column max_weeks set default 20,
  alter column max_weeks set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column imported_at set default now(),
  alter column imported_at set not null;

alter table public.courses
  alter column schedule_id set not null,
  alter column user_id set not null,
  alter column name set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  alter table public.schedules
    add constraint schedules_semester_tag_length
    check (char_length(semester_tag) between 1 and 80);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.schedules
    add constraint schedules_school_length
    check (school is null or char_length(school) <= 160);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.schedules
    add constraint schedules_max_weeks_bounds
    check (max_weeks between 1 and 30);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_name_length
    check (char_length(name) between 1 and 200);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_room_length
    check (room is null or char_length(room) <= 200);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_teacher_length
    check (teacher is null or char_length(teacher) <= 120);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_time_order
    check (end_time > start_time);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_week_bounds
    check (
      start_week between 1 and 30
      and end_week between 1 and 30
      and end_week >= start_week
    );
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.courses
    add constraint courses_color_hex
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.schedules'::regclass
      and constraint_record.conname = 'schedules_id_user_id_key'
  ) then
    alter table public.schedules
      add constraint schedules_id_user_id_key unique (id, user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_record
    where constraint_record.conrelid = 'public.courses'::regclass
      and constraint_record.conname = 'courses_schedule_owner_fkey'
  ) then
    alter table public.courses
      add constraint courses_schedule_owner_fkey
      foreign key (schedule_id, user_id)
      references public.schedules(id, user_id)
      on delete cascade;
  end if;
end
$$;

with ranked_courses as (
  select course.id,
         pg_catalog.row_number() over (
           partition by course.schedule_id
           order by course.created_at desc, course.id desc
         ) as course_rank
  from public.courses course
)
insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'course', course.id, 'course_limit_overflow_removed', pg_catalog.to_jsonb(course)
from public.courses course
join ranked_courses ranked on ranked.id = course.id
where ranked.course_rank > 500
on conflict (entity_type, entity_id, reason) do nothing;

with ranked_courses as (
  select course.id,
         pg_catalog.row_number() over (
           partition by course.schedule_id
           order by course.created_at desc, course.id desc
         ) as course_rank
  from public.courses course
)
delete from public.courses course
using ranked_courses ranked
where course.id = ranked.id
  and ranked.course_rank > 500;

create or replace function private.enforce_course_schedule_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  schedule_weeks integer;
  existing_courses integer;
  check_course_limit boolean := false;
begin
  if tg_op = 'INSERT' then
    check_course_limit := true;
  elsif new.schedule_id is distinct from old.schedule_id then
    check_course_limit := true;
  end if;

  -- Inserts and schedule moves take the same advisory lock as atomic replace
  -- before touching the parent row. End-week-only updates do not need the
  -- course-count lock, but still hold FOR SHARE against concurrent shrink.
  if check_course_limit then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.schedule_id::text, 930260829)
    );
  end if;

  select schedule.max_weeks
  into schedule_weeks
  from public.schedules schedule
  where schedule.id = new.schedule_id
    and schedule.user_id = new.user_id
  for share;

  if not found then
    raise exception 'Course schedule and owner do not match'
      using errcode = '23503';
  end if;

  if check_course_limit then
    select pg_catalog.count(*)
    into existing_courses
    from public.courses course
    where course.schedule_id = new.schedule_id
      and course.id <> new.id;

    if existing_courses >= 500 then
      raise exception 'A schedule may contain at most 500 courses'
        using errcode = '23514';
    end if;
  end if;

  if new.end_week > schedule_weeks then
    raise exception 'Course week exceeds the schedule maximum'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function private.prevent_invalid_schedule_shrink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.max_weeks < old.max_weeks then
    if exists (
       select 1
       from public.courses course
       where course.schedule_id = old.id
         and course.user_id = old.user_id
         and course.end_week > new.max_weeks
    ) then
      raise exception 'Schedule maximum cannot exclude an existing course week'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

revoke all on function private.enforce_course_schedule_integrity() from public;
revoke all on function private.prevent_invalid_schedule_shrink() from public;
drop trigger if exists enforce_course_schedule_integrity on public.courses;
create trigger enforce_course_schedule_integrity
  before insert or update of schedule_id, user_id, end_week
  on public.courses
  for each row execute function private.enforce_course_schedule_integrity();
drop trigger if exists prevent_invalid_schedule_shrink on public.schedules;
create trigger prevent_invalid_schedule_shrink
  before update of max_weeks on public.schedules
  for each row execute function private.prevent_invalid_schedule_shrink();

-- Retain the most recently imported active schedule for each user, then make
-- the invariant concurrency-safe. The BEFORE trigger serializes activation,
-- atomically deactivates the previous row, and lets a failed write roll back
-- the entire switch.
with ranked_active as (
  select schedule.id,
         pg_catalog.row_number() over (
           partition by schedule.user_id
           order by schedule.imported_at desc nulls last, schedule.id desc
         ) as active_rank
  from public.schedules schedule
  where schedule.is_active = true
)
update public.schedules schedule
set is_active = false
from ranked_active
where schedule.id = ranked_active.id
  and ranked_active.active_rank > 1;

create unique index if not exists schedules_one_active_per_user_idx
  on public.schedules(user_id)
  where is_active = true;

create or replace function private.set_single_active_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active = true then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(new.user_id::text, 920260829)
    );

    update public.schedules schedule
    set is_active = false
    where schedule.user_id = new.user_id
      and schedule.id <> new.id
      and schedule.is_active = true;
  end if;

  return new;
end
$$;

revoke all on function private.set_single_active_schedule() from public;
drop trigger if exists a_set_single_active_schedule on public.schedules;
create trigger a_set_single_active_schedule
  before insert or update of is_active, user_id
  on public.schedules
  for each row execute function private.set_single_active_schedule();

-- Row locks on the owning profile turn the application quotas into actual
-- transactional invariants instead of race-prone count-then-insert checks.
create or replace function private.enforce_room_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_rooms integer;
  existing_rooms integer;
begin
  if new.admin_id is null then
    raise exception 'Room owner is required' using errcode = '23502';
  end if;

  select profile.room_quota
  into allowed_rooms
  from public.profiles profile
  where profile.id = new.admin_id
  for update;

  if not found then
    raise exception 'Room owner profile does not exist' using errcode = '23503';
  end if;

  select pg_catalog.count(*)
  into existing_rooms
  from public.rooms room
  where room.admin_id = new.admin_id
    and room.id <> new.id;

  if existing_rooms >= allowed_rooms then
    raise exception 'Room quota exceeded' using errcode = '23514';
  end if;

  return new;
end
$$;

create or replace function private.enforce_schedule_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_schedules integer;
  existing_schedules integer;
begin
  select profile.schedule_quota
  into allowed_schedules
  from public.profiles profile
  where profile.id = new.user_id
  for update;

  if not found then
    raise exception 'Schedule owner profile does not exist' using errcode = '23503';
  end if;

  select pg_catalog.count(*)
  into existing_schedules
  from public.schedules schedule
  where schedule.user_id = new.user_id
    and schedule.id <> new.id;

  if existing_schedules >= allowed_schedules then
    raise exception 'Schedule quota exceeded' using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.enforce_room_quota() from public;
revoke all on function private.enforce_schedule_quota() from public;
drop trigger if exists enforce_room_quota on public.rooms;
create trigger enforce_room_quota
  before insert or update of admin_id on public.rooms
  for each row execute function private.enforce_room_quota();
drop trigger if exists b_enforce_schedule_quota on public.schedules;
create trigger b_enforce_schedule_quota
  before insert or update of user_id on public.schedules
  for each row execute function private.enforce_schedule_quota();

-- Supporting indexes for trigger counts, room/profile helpers, cascades and
-- rate-limit windows. The reverse room_members key is required because the
-- primary key starts with room_id, while co-membership begins at user_id.
create index if not exists courses_schedule_owner_idx
  on public.courses (schedule_id, user_id);
create index if not exists rooms_admin_id_idx
  on public.rooms (admin_id);
create index if not exists room_members_user_room_idx
  on public.room_members (user_id, room_id);
create index if not exists manual_schedule_submissions_user_created_idx
  on public.manual_schedule_submissions (user_id, created_at desc);
create index if not exists manual_schedule_submissions_user_status_idx
  on public.manual_schedule_submissions (user_id, status);
create index if not exists busy_blocks_user_created_idx
  on public.busy_blocks (user_id, created_at);

-- --------------------------------------------------------------------------
-- Rooms and invitations. Public visibility expires on time; authenticated
-- administrators/members retain access so that they can clean up an expired
-- room. Invitation acceptance is one locked transaction inside the database.
-- --------------------------------------------------------------------------
update public.rooms room
set name = case
      when pg_catalog.btrim(coalesce(room.name, '')) = ''
        then 'Untitled Room ' || room.id::text
      when char_length(pg_catalog.btrim(room.name)) > 100
        then pg_catalog.left(pg_catalog.btrim(room.name), 63) || ' ' || room.id::text
      else pg_catalog.btrim(room.name)
    end,
    description = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(room.description, '')), 500), ''),
    is_public = coalesce(room.is_public, false),
    created_at = coalesce(room.created_at, pg_catalog.now());

alter table public.rooms
  alter column is_public set default false,
  alter column is_public set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  alter table public.rooms
    add constraint rooms_name_length
    check (char_length(name) between 1 and 100);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.rooms
    add constraint rooms_description_length
    check (description is null or char_length(description) <= 500);
exception when duplicate_object then null;
end
$$;

update public.room_members membership
set color = case
      when membership.color ~ '^#[0-9a-fA-F]{6}$' then pg_catalog.lower(membership.color)
      else '#2563eb'
    end,
    joined_at = coalesce(membership.joined_at, pg_catalog.now());

alter table public.room_members
  alter column joined_at set default now(),
  alter column joined_at set not null;

do $$
begin
  alter table public.room_members
    add constraint room_members_color_hex
    check (color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null;
end
$$;

insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'invitation', invitation.id, 'incomplete_invitation_removed', pg_catalog.to_jsonb(invitation)
from public.invitations invitation
where invitation.room_id is null
   or invitation.invitee_id is null
   or invitation.inviter_id is null
on conflict (entity_type, entity_id, reason) do nothing;

delete from public.invitations invitation
where invitation.room_id is null
   or invitation.invitee_id is null
   or invitation.inviter_id is null;

update public.invitations invitation
set status = coalesce(invitation.status, 'pending'),
    created_at = coalesce(invitation.created_at, pg_catalog.now());

with ranked_pending as (
  select invitation.id,
         pg_catalog.row_number() over (
           partition by invitation.room_id, invitation.invitee_id
           order by invitation.created_at desc, invitation.id desc
         ) as pending_rank
  from public.invitations invitation
  where invitation.status = 'pending'
)
update public.invitations invitation
set status = 'declined'
from ranked_pending ranked
where invitation.id = ranked.id
  and ranked.pending_rank > 1;

alter table public.invitations
  alter column room_id set not null,
  alter column invitee_id set not null,
  alter column inviter_id set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

create unique index if not exists invitations_one_pending_per_user_room_idx
  on public.invitations(room_id, invitee_id)
  where status = 'pending';

create or replace function private.guard_invitation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or private.is_superadmin(actor_id) then
    return new;
  end if;

  if actor_id <> old.invitee_id
     or new.id is distinct from old.id
     or new.room_id is distinct from old.room_id
     or new.invitee_id is distinct from old.invitee_id
     or new.inviter_id is distinct from old.inviter_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Invitation identity fields are immutable'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
      raise exception 'Invalid invitation status transition'
        using errcode = '23514';
    end if;

    if new.status = 'accepted'
       and not exists (
         select 1
         from public.room_members membership
         where membership.room_id = old.room_id
           and membership.user_id = old.invitee_id
       ) then
      raise exception 'Membership must exist before accepting an invitation'
        using errcode = '23514';
    end if;
  end if;

  return new;
end
$$;

revoke all on function private.guard_invitation_update() from public;
drop trigger if exists guard_invitation_update on public.invitations;
create trigger guard_invitation_update
  before update on public.invitations
  for each row execute function private.guard_invitation_update();

create or replace function public.accept_room_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  accepted_room_id uuid;
  assigned_color text;
  member_count integer;
  color_palette constant text[] := array[
    '#2563eb', '#059669', '#b45309', '#7c3aed',
    '#0891b2', '#65a30d', '#c2410c', '#475569'
  ]::text[];
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select invitation.room_id
  into accepted_room_id
  from public.invitations invitation
  where invitation.id = p_invitation_id
    and invitation.invitee_id = actor_id
    and invitation.status = 'pending'
  for update;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '42501';
  end if;

  perform 1
  from public.rooms room
  where room.id = accepted_room_id
    and (room.expires_at is null or room.expires_at > pg_catalog.now())
  for update;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '42501';
  end if;

  select candidate.color
  into assigned_color
  from pg_catalog.unnest(color_palette) with ordinality as candidate(color, sort_order)
  where not exists (
    select 1
    from public.room_members membership
    where membership.room_id = accepted_room_id
      and pg_catalog.lower(membership.color) = candidate.color
  )
  order by candidate.sort_order
  limit 1;

  if assigned_color is null then
    select pg_catalog.count(*)
    into member_count
    from public.room_members membership
    where membership.room_id = accepted_room_id;

    assigned_color := color_palette[(member_count % pg_catalog.array_length(color_palette, 1)) + 1];
  end if;

  insert into public.room_members (room_id, user_id, color)
  values (accepted_room_id, actor_id, assigned_color)
  on conflict (room_id, user_id) do nothing;

  update public.invitations invitation
  set status = 'accepted'
  where invitation.id = p_invitation_id
    and invitation.invitee_id = actor_id
    and invitation.room_id = accepted_room_id
    and invitation.status = 'pending';

  if not found then
    raise exception 'Invitation is unavailable' using errcode = '42501';
  end if;

  return accepted_room_id;
end
$$;

revoke all on function public.accept_room_invitation(uuid) from public;
revoke all on function public.accept_room_invitation(uuid) from anon;
grant execute on function public.accept_room_invitation(uuid) to authenticated;

-- Refresh table policies after the helper definitions. Direct public-room
-- access remains limited to room metadata/member colors. Schedule, course and
-- busy data for public visitors is exposed only by the scoped calendar RPC.
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.courses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.invitations enable row level security;

drop policy if exists "schedules_select_own" on public.schedules;
drop policy if exists "schedules_select_room_member" on public.schedules;
drop policy if exists "schedules_insert_own" on public.schedules;
drop policy if exists "schedules_update_own" on public.schedules;
drop policy if exists "schedules_delete_own" on public.schedules;
create policy "schedules_select_own" on public.schedules for select to authenticated
  using (auth.uid() = user_id);
create policy "schedules_select_room_member" on public.schedules for select to authenticated
  using (private.is_room_co_member(user_id));
create policy "schedules_insert_own" on public.schedules for insert to authenticated
  with check (auth.uid() = user_id);
create policy "schedules_update_own" on public.schedules for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "schedules_delete_own" on public.schedules for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "courses_select_own" on public.courses;
drop policy if exists "courses_select_room_member" on public.courses;
drop policy if exists "courses_insert_own" on public.courses;
drop policy if exists "courses_update_own" on public.courses;
drop policy if exists "courses_delete_own" on public.courses;
create policy "courses_select_own" on public.courses for select to authenticated
  using (auth.uid() = user_id);
create policy "courses_select_room_member" on public.courses for select to authenticated
  using (private.is_room_co_member(user_id));
create policy "courses_insert_own" on public.courses for insert to authenticated
  with check (auth.uid() = user_id);
create policy "courses_update_own" on public.courses for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "courses_delete_own" on public.courses for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "rooms_select_member_or_public" on public.rooms;
drop policy if exists "rooms_select_public" on public.rooms;
drop policy if exists "rooms_select_authenticated" on public.rooms;
drop policy if exists "rooms_insert_own" on public.rooms;
drop policy if exists "rooms_update_admin" on public.rooms;
drop policy if exists "rooms_delete_admin" on public.rooms;
create policy "rooms_select_public" on public.rooms for select to anon, authenticated using (
  is_public = true and (expires_at is null or expires_at > pg_catalog.now())
);
create policy "rooms_select_authenticated" on public.rooms for select to authenticated using (
  admin_id = auth.uid() or private.is_room_member_sd(id)
);
create policy "rooms_insert_own" on public.rooms for insert to authenticated
  with check (auth.uid() = admin_id);
create policy "rooms_update_admin" on public.rooms for update to authenticated
  using (auth.uid() = admin_id)
  with check (auth.uid() = admin_id);
create policy "rooms_delete_admin" on public.rooms for delete to authenticated
  using (auth.uid() = admin_id);

drop policy if exists "room_members_select" on public.room_members;
drop policy if exists "room_members_select_public" on public.room_members;
drop policy if exists "room_members_select_authenticated" on public.room_members;
drop policy if exists "room_members_insert" on public.room_members;
drop policy if exists "room_members_delete" on public.room_members;
create policy "room_members_select_public" on public.room_members for select to anon, authenticated
  using (private.is_room_admin_or_public_sd(room_id));
create policy "room_members_select_authenticated" on public.room_members for select to authenticated using (
  auth.uid() = user_id or private.is_room_member_sd(room_id)
);
create policy "room_members_insert" on public.room_members for insert to authenticated with check (
  auth.uid() = user_id
  and (
    private.is_room_owner(room_id)
    or private.has_pending_room_invitation(room_id)
  )
);
create policy "room_members_delete" on public.room_members for delete to authenticated using (
  auth.uid() = user_id
  or private.can_manage_room(room_id)
);

drop policy if exists "invitations_select" on public.invitations;
drop policy if exists "invitations_insert" on public.invitations;
drop policy if exists "invitations_update_invitee" on public.invitations;
create policy "invitations_select" on public.invitations for select to authenticated using (
  auth.uid() = invitee_id or auth.uid() = inviter_id
);
create policy "invitations_insert" on public.invitations for insert to authenticated with check (
  auth.uid() = inviter_id
  and invitee_id <> inviter_id
  and private.can_manage_room(room_id)
);
create policy "invitations_update_invitee" on public.invitations for update to authenticated
  using (auth.uid() = invitee_id)
  with check (auth.uid() = invitee_id);

-- --------------------------------------------------------------------------
-- Import-interface administration and the deployed generic adapter seed.
-- --------------------------------------------------------------------------
alter table public.import_interfaces enable row level security;

drop policy if exists "import_interfaces_select_all" on public.import_interfaces;
drop policy if exists "import_interfaces_admin_insert" on public.import_interfaces;
drop policy if exists "import_interfaces_admin_update" on public.import_interfaces;
drop policy if exists "import_interfaces_admin_delete" on public.import_interfaces;
create policy "import_interfaces_select_all" on public.import_interfaces for select
  using (true);
create policy "import_interfaces_admin_insert" on public.import_interfaces for insert to authenticated
  with check (private.is_superadmin(auth.uid()));
create policy "import_interfaces_admin_update" on public.import_interfaces for update to authenticated
  using (private.is_superadmin(auth.uid()))
  with check (private.is_superadmin(auth.uid()));
create policy "import_interfaces_admin_delete" on public.import_interfaces for delete to authenticated
  using (private.is_superadmin(auth.uid()));

update public.import_interfaces interface
set description = '适用于 BumpFree v1、Word、Excel、HTML、CSV、手机粘贴文本或 AI 整理后的课表。',
    upload_label = '上传课表文件',
    hints = '["可以直接粘贴 BumpFree Schedule Import v1 文本，或上传 DOCX、XLSX、XLS、CSV、HTML、TXT 抽取文本。", "PDF 暂不在站内直接解析；请先用本地工具或可信 AI 转为文本，再粘贴导入。", "复杂版式如果无法直接识别，可先让 AI 整理成 v1 格式；导入前务必检查预览。", "解析预览确认前不会保存任何课程。"]'::jsonb,
    accepted_file_types = '.txt,.html,.htm,.docx,.xlsx,.xls,.csv,text/plain,text/html,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel',
    updated_at = pg_catalog.now()
where interface.id = 'generic-text';

update public.import_interfaces interface
set title = '西南石油大学课表文本导入',
    description = '适用于西南石油大学 timeTableForStu 课表安全转换后的文本。',
    input_label = '课表文本',
    upload_label = '上传 TXT',
    placeholder = '粘贴 timeTableForStu PDF 经本地工具或可信 AI 抽取后的课表文本...',
    hints = '["出于服务端内存安全考虑，PDF 不在站内直接解析；请先在本地或可信 AI 工具中抽取为 UTF-8 文本。", "专用适配器会从文本解析课程代码、周次、星期、节次和教室。", "节次会按西南石油大学教学日历中的作息时间映射为具体开始/结束时间，预览中仍可手动调整学期信息。"]'::jsonb,
    accepted_file_types = '.txt,text/plain',
    updated_at = pg_catalog.now()
where interface.id = 'swpu-pdf';

-- Remove PDF selectors from existing custom interfaces as well. Direct PDF
-- parsing is intentionally disabled until it can run under a hard process or
-- container memory limit; a small compressed PDF can otherwise exhaust the
-- application process before an output-size check runs.
update public.import_interfaces interface
set accepted_file_types = coalesce(nullif((
      select pg_catalog.string_agg(pg_catalog.btrim(item.token), ',' order by item.ordinality)
      from pg_catalog.unnest(pg_catalog.string_to_array(interface.accepted_file_types, ','))
        with ordinality as item(token, ordinality)
      where pg_catalog.lower(pg_catalog.btrim(item.token)) not in ('.pdf', 'application/pdf', 'application/x-pdf')
    ), ''), '.txt,text/plain'),
    updated_at = pg_catalog.now()
where exists (
  select 1
  from pg_catalog.unnest(pg_catalog.string_to_array(interface.accepted_file_types, ',')) as item(token)
  where pg_catalog.lower(pg_catalog.btrim(item.token)) in ('.pdf', 'application/pdf', 'application/x-pdf')
);

-- --------------------------------------------------------------------------
-- Manual submissions. Attachment metadata is all-or-none, base64 is decoded
-- and matched to size/type, text and attachment sizes are bounded, and a
-- per-user advisory lock enforces 5 pending plus 10 submissions per 24 hours.
-- --------------------------------------------------------------------------
create or replace function private.manual_attachment_is_valid(
  p_file_name text,
  p_file_type text,
  p_file_size integer,
  p_file_data text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  decoded_data bytea;
  decoded_text text;
begin
  if p_file_name is null
     and p_file_type is null
     and p_file_size is null
     and p_file_data is null then
    return true;
  end if;

  if p_file_name is null
     or p_file_type is null
     or p_file_size is null
     or p_file_data is null
     or char_length(p_file_name) not between 1 and 255
     or p_file_type not in (
       'text/plain', 'text/html', 'image/png', 'image/jpeg', 'image/webp'
     )
     or p_file_size not between 1 and 2097152
     or char_length(p_file_data) > 2796204
     or p_file_data !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
    return false;
  end if;

  begin
    decoded_data := pg_catalog.decode(p_file_data, 'base64');
  exception when others then
    return false;
  end;

  if pg_catalog.octet_length(decoded_data) <> p_file_size then
    return false;
  end if;

  if p_file_type = 'image/png' then
    return pg_catalog.substr(decoded_data, 1, 8) = pg_catalog.decode('89504e470d0a1a0a', 'hex');
  elsif p_file_type = 'image/jpeg' then
    return pg_catalog.substr(decoded_data, 1, 3) = pg_catalog.decode('ffd8ff', 'hex');
  elsif p_file_type = 'image/webp' then
    return p_file_size >= 12
      and pg_catalog.substr(decoded_data, 1, 4) = pg_catalog.decode('52494646', 'hex')
      and pg_catalog.substr(decoded_data, 9, 4) = pg_catalog.decode('57454250', 'hex');
  end if;

  begin
    decoded_text := pg_catalog.convert_from(decoded_data, 'UTF8');
  exception when others then
    return false;
  end;

  return decoded_text is not null;
end
$$;

revoke all on function private.manual_attachment_is_valid(text, text, integer, text) from public;
grant execute on function private.manual_attachment_is_valid(text, text, integer, text) to authenticated;

insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'manual_schedule_submission', submission.id, 'invalid_attachment_removed', pg_catalog.to_jsonb(submission)
from public.manual_schedule_submissions submission
where not private.manual_attachment_is_valid(
  submission.file_name,
  submission.file_type,
  submission.file_size,
  submission.file_data
)
on conflict (entity_type, entity_id, reason) do nothing;

update public.manual_schedule_submissions submission
set file_name = null,
    file_type = null,
    file_size = null,
    file_data = null
where not private.manual_attachment_is_valid(
  submission.file_name,
  submission.file_type,
  submission.file_size,
  submission.file_data
);

update public.manual_schedule_submissions submission
set text_content = case
      when pg_catalog.btrim(coalesce(submission.text_content, '')) = ''
           and submission.file_data is null
        then '(legacy submission content was invalid; see private.security_quarantine)'
      else nullif(pg_catalog.left(pg_catalog.btrim(coalesce(submission.text_content, '')), 50000), '')
    end,
    admin_note = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(submission.admin_note, '')), 4000), ''),
    created_at = coalesce(submission.created_at, pg_catalog.now()),
    updated_at = coalesce(submission.updated_at, submission.created_at, pg_catalog.now());

do $$
begin
  alter table public.manual_schedule_submissions
    add constraint manual_schedule_submissions_text_length
    check (text_content is null or char_length(text_content) <= 50000);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.manual_schedule_submissions
    add constraint manual_schedule_submissions_admin_note_length
    check (admin_note is null or char_length(admin_note) <= 4000);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.manual_schedule_submissions
    add constraint manual_schedule_submissions_attachment_valid
    check (private.manual_attachment_is_valid(file_name, file_type, file_size, file_data));
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.manual_schedule_submissions
    add constraint manual_schedule_submissions_content_present
    check (nullif(pg_catalog.btrim(coalesce(text_content, '')), '') is not null or file_data is not null);
exception when duplicate_object then null;
end
$$;

create or replace function private.guard_manual_submission_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  pending_count integer;
  recent_count integer;
begin
  if actor_id is null then
    return new;
  end if;

  if new.user_id <> actor_id then
    raise exception 'A submission may only be created for the current user'
      using errcode = '42501';
  end if;

  if char_length(coalesce(new.text_content, '')) > 50000
     or char_length(coalesce(new.file_data, '')) > 2796204 then
    raise exception 'Submission content is too large' using errcode = '22001';
  end if;

  new.status := 'pending';
  new.admin_note := null;
  new.created_at := pg_catalog.now();
  new.updated_at := new.created_at;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text, 940260829)
  );

  select pg_catalog.count(*)
  into pending_count
  from public.manual_schedule_submissions submission
  where submission.user_id = actor_id
    and submission.status = 'pending';

  if pending_count >= 5 then
    raise exception 'At most 5 pending submissions are allowed'
      using errcode = '23514';
  end if;

  select pg_catalog.count(*)
  into recent_count
  from public.manual_schedule_submissions submission
  where submission.user_id = actor_id
    and submission.created_at >= pg_catalog.now() - interval '24 hours';

  if recent_count >= 10 then
    raise exception 'At most 10 submissions are allowed per 24 hours'
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.guard_manual_submission_insert() from public;
drop trigger if exists guard_manual_submission_insert on public.manual_schedule_submissions;
create trigger guard_manual_submission_insert
  before insert on public.manual_schedule_submissions
  for each row execute function private.guard_manual_submission_insert();

alter table public.manual_schedule_submissions enable row level security;
drop policy if exists "manual_schedule_submissions_insert_own" on public.manual_schedule_submissions;
drop policy if exists "manual_schedule_submissions_select_own_or_admin" on public.manual_schedule_submissions;
drop policy if exists "manual_schedule_submissions_admin_update" on public.manual_schedule_submissions;
create policy "manual_schedule_submissions_insert_own"
  on public.manual_schedule_submissions for insert to authenticated
  with check (
    auth.uid() = user_id
    and status = 'pending'
    and admin_note is null
  );
create policy "manual_schedule_submissions_select_own_or_admin"
  on public.manual_schedule_submissions for select to authenticated
  using (auth.uid() = user_id or private.is_superadmin(auth.uid()));
create policy "manual_schedule_submissions_admin_update"
  on public.manual_schedule_submissions for update to authenticated
  using (private.is_superadmin(auth.uid()))
  with check (private.is_superadmin(auth.uid()));

-- --------------------------------------------------------------------------
-- Busy blocks: bound sensitive free text, date range and duration; preserve a
-- private copy of irreparable legacy rows; rate-limit new rows under a lock.
-- --------------------------------------------------------------------------
insert into private.security_quarantine (entity_type, entity_id, reason, payload)
select 'busy_block', busy.id, 'invalid_busy_block_removed', pg_catalog.to_jsonb(busy)
from public.busy_blocks busy
where busy.starts_at < timestamptz '2000-01-01 00:00:00+00'
   or busy.ends_at >= timestamptz '2101-01-01 00:00:00+00'
   or busy.ends_at <= busy.starts_at
   or busy.ends_at - busy.starts_at > interval '31 days'
on conflict (entity_type, entity_id, reason) do nothing;

delete from public.busy_blocks busy
where busy.starts_at < timestamptz '2000-01-01 00:00:00+00'
   or busy.ends_at >= timestamptz '2101-01-01 00:00:00+00'
   or busy.ends_at <= busy.starts_at
   or busy.ends_at - busy.starts_at > interval '31 days';

update public.busy_blocks busy
set title = case
      when pg_catalog.btrim(coalesce(busy.title, '')) = '' then 'Busy'
      else pg_catalog.left(pg_catalog.btrim(busy.title), 80)
    end,
    note = nullif(pg_catalog.left(pg_catalog.btrim(coalesce(busy.note, '')), 1000), ''),
    created_at = coalesce(busy.created_at, pg_catalog.now());

alter table public.busy_blocks
  alter column created_at set default now(),
  alter column created_at set not null;

do $$
begin
  alter table public.busy_blocks
    add constraint busy_blocks_title_length
    check (char_length(title) between 1 and 80);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.busy_blocks
    add constraint busy_blocks_note_length
    check (note is null or char_length(note) <= 1000);
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.busy_blocks
    add constraint busy_blocks_safe_time_range
    check (
      starts_at >= timestamptz '2000-01-01 00:00:00+00'
      and ends_at < timestamptz '2101-01-01 00:00:00+00'
      and ends_at > starts_at
      and ends_at - starts_at <= interval '31 days'
    );
exception when duplicate_object then null;
end
$$;

create or replace function private.guard_busy_block_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  recent_count integer;
  total_count integer;
begin
  if actor_id is null then
    return new;
  end if;

  if new.user_id <> actor_id then
    raise exception 'A busy block may only belong to the current user'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Busy block ownership and creation time are immutable'
        using errcode = '42501';
    end if;
    return new;
  end if;

  new.created_at := pg_catalog.now();
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text, 950260829)
  );

  select pg_catalog.count(*),
         pg_catalog.count(*) filter (
           where busy.created_at >= pg_catalog.now() - interval '1 hour'
         )
  into total_count, recent_count
  from public.busy_blocks busy
  where busy.user_id = actor_id;

  if total_count >= 1000 then
    raise exception 'At most 1000 busy blocks are allowed per user'
      using errcode = '23514';
  end if;

  if recent_count >= 60 then
    raise exception 'At most 60 busy blocks are allowed per hour'
      using errcode = '23514';
  end if;

  return new;
end
$$;

revoke all on function private.guard_busy_block_write() from public;
drop trigger if exists guard_busy_block_write on public.busy_blocks;
create trigger guard_busy_block_write
  before insert or update on public.busy_blocks
  for each row execute function private.guard_busy_block_write();

alter table public.busy_blocks enable row level security;
drop policy if exists "busy_blocks_select_own" on public.busy_blocks;
drop policy if exists "busy_blocks_select_room_member" on public.busy_blocks;
drop policy if exists "busy_blocks_insert_own" on public.busy_blocks;
drop policy if exists "busy_blocks_update_own" on public.busy_blocks;
drop policy if exists "busy_blocks_delete_own" on public.busy_blocks;
create policy "busy_blocks_select_own" on public.busy_blocks for select to authenticated
  using (auth.uid() = user_id);
create policy "busy_blocks_select_room_member" on public.busy_blocks for select to authenticated
  using (private.is_room_co_member(user_id));
create policy "busy_blocks_insert_own" on public.busy_blocks for insert to authenticated
  with check (auth.uid() = user_id);
create policy "busy_blocks_update_own" on public.busy_blocks for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "busy_blocks_delete_own" on public.busy_blocks for delete to authenticated
  using (auth.uid() = user_id);

-- --------------------------------------------------------------------------
-- Scoped room calendar. This is the only anonymous path to schedule/course/
-- busy data: it verifies this exact room, selects this exact member set, and
-- returns only each member's newest active schedule. Public visitors receive
-- redacted busy labels/notes; authenticated room members/admins receive them.
-- --------------------------------------------------------------------------
create or replace function public.get_room_calendar(p_room_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected_room public.rooms%rowtype;
  actor_is_member boolean := false;
  actor_is_admin boolean := false;
  public_access boolean := false;
  member_payload jsonb;
begin
  select room.*
  into selected_room
  from public.rooms room
  where room.id = p_room_id;

  if not found then
    raise exception 'Room calendar is unavailable' using errcode = '42501';
  end if;

  actor_is_admin := actor_id is not null and selected_room.admin_id = actor_id;
  actor_is_member := actor_id is not null and exists (
    select 1
    from public.room_members membership
    where membership.room_id = p_room_id
      and membership.user_id = actor_id
  );
  public_access := selected_room.is_public = true
    and (selected_room.expires_at is null or selected_room.expires_at > pg_catalog.now());

  if not public_access and not actor_is_member and not actor_is_admin then
    raise exception 'Room calendar is unavailable' using errcode = '42501';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', membership.user_id,
        'display_name', profile.display_name,
        'color', membership.color,
        'joined_at', membership.joined_at,
        'schedule', case
          when active_schedule.id is null then null
          else pg_catalog.jsonb_build_object(
            'id', active_schedule.id,
            'user_id', active_schedule.user_id,
            'semester_tag', active_schedule.semester_tag,
            'school', active_schedule.school,
            'start_date', active_schedule.start_date,
            'max_weeks', active_schedule.max_weeks,
            'imported_at', active_schedule.imported_at,
            'courses', coalesce((
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id', course.id,
                  'name', course.name,
                  'room', course.room,
                  'teacher', course.teacher,
                  'day_of_week', course.day_of_week,
                  'start_time', course.start_time,
                  'end_time', course.end_time,
                  'start_week', course.start_week,
                  'end_week', course.end_week,
                  'color', course.color
                )
                order by course.day_of_week, course.start_time, course.id
              )
              from public.courses course
              where course.schedule_id = active_schedule.id
                and course.user_id = membership.user_id
            ), '[]'::jsonb)
          )
        end,
        'busy_blocks', coalesce((
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', scoped_busy.id,
              'title', case
                when actor_is_member or actor_is_admin then scoped_busy.title
                else 'Busy'
              end,
              'starts_at', scoped_busy.starts_at,
              'ends_at', scoped_busy.ends_at,
              'note', case
                when actor_is_member or actor_is_admin then scoped_busy.note
                else null
              end,
              'source', scoped_busy.source
            )
            order by scoped_busy.starts_at, scoped_busy.id
          )
          from (
            select busy.id,
                   busy.title,
                   busy.starts_at,
                   busy.ends_at,
                   busy.note,
                   busy.source
            from public.busy_blocks busy
            where busy.user_id = membership.user_id
            order by busy.starts_at desc, busy.id desc
            limit 1000
          ) scoped_busy
        ), '[]'::jsonb)
      )
      order by membership.joined_at nulls last, membership.user_id
    ),
    '[]'::jsonb
  )
  into member_payload
  from public.room_members membership
  join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select schedule.id,
           schedule.user_id,
           schedule.semester_tag,
           schedule.school,
           schedule.start_date,
           schedule.max_weeks,
           schedule.imported_at
    from public.schedules schedule
    where schedule.user_id = membership.user_id
      and schedule.is_active = true
    order by schedule.imported_at desc, schedule.id desc
    limit 1
  ) active_schedule on true
  where membership.room_id = p_room_id;

  return pg_catalog.jsonb_build_object(
    'room', pg_catalog.jsonb_build_object(
      'id', selected_room.id,
      'name', selected_room.name,
      'description', selected_room.description,
      'is_public', selected_room.is_public,
      'expires_at', selected_room.expires_at
    ),
    'members', member_payload
  );
end
$$;

revoke all on function public.get_room_calendar(uuid) from public;
grant execute on function public.get_room_calendar(uuid) to anon, authenticated;

-- --------------------------------------------------------------------------
-- Atomic replace import. Deleting the old set before inserting the validated
-- replacement avoids temporarily exceeding the 500-course trigger, while a
-- single function statement guarantees that any later error restores both the
-- old courses and metadata. SECURITY INVOKER deliberately keeps table RLS in
-- force; the explicit auth.uid() ownership predicate is defense in depth.
--
-- p_courses is a JSON array of objects with required keys:
-- id, name, day_of_week, start_time, end_time, start_week, end_week, color.
-- room and teacher are optional. schedule_id/user_id keys, if supplied by an
-- existing caller payload, are ignored and replaced with the locked owner.
-- --------------------------------------------------------------------------
create or replace function public.replace_schedule_courses(
  p_schedule_id uuid,
  p_school text,
  p_start_date date,
  p_max_weeks integer,
  p_courses jsonb
)
returns integer
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  course_entry record;
  course_payload jsonb;
  course_id uuid;
  course_name text;
  course_room text;
  course_teacher text;
  course_day integer;
  course_start_time time;
  course_end_time time;
  course_start_week integer;
  course_end_week integer;
  course_color text;
  normalized_school text;
  replacement_count integer;
  seen_course_ids uuid[] := array[]::uuid[];
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_schedule_id is null then
    raise exception 'Schedule ID is required' using errcode = '22023';
  end if;

  if p_start_date is null
     or p_start_date < date '2000-01-01'
     or p_start_date >= date '2101-01-01'
     or pg_catalog.date_part('isodow', p_start_date) <> 1 then
    raise exception 'Start date must be a Monday between 2000 and 2100'
      using errcode = '22023';
  end if;

  if p_max_weeks is null or p_max_weeks not between 1 and 30 then
    raise exception 'Maximum weeks must be between 1 and 30'
      using errcode = '22023';
  end if;

  normalized_school := nullif(pg_catalog.btrim(coalesce(p_school, '')), '');
  if normalized_school is not null and char_length(normalized_school) > 160 then
    raise exception 'School must contain at most 160 characters'
      using errcode = '22023';
  end if;

  if p_courses is null
     or pg_catalog.jsonb_typeof(p_courses) <> 'array'
     or pg_catalog.pg_column_size(p_courses) > 2097152 then
    raise exception 'Courses must be a JSON array no larger than 2 MiB'
      using errcode = '22023';
  end if;

  replacement_count := pg_catalog.jsonb_array_length(p_courses);
  if replacement_count not between 1 and 500 then
    raise exception 'A replacement must contain between 1 and 500 courses'
      using errcode = '22023';
  end if;

  -- Serialize against inserts/replacements before locking the parent row.
  -- Schedule shrink never takes this advisory lock, so it cannot form the
  -- advisory <-> row-lock cycle that this ordering is designed to avoid.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_schedule_id::text, 930260829)
  );

  perform 1
  from public.schedules schedule
  where schedule.id = p_schedule_id
    and schedule.user_id = actor_id
  for update;

  if not found then
    raise exception 'Schedule is unavailable' using errcode = '42501';
  end if;

  -- Validate the complete replacement before mutating either table.
  for course_entry in
    select element.value, element.ordinality
    from pg_catalog.jsonb_array_elements(p_courses) with ordinality as element(value, ordinality)
    order by element.ordinality
  loop
    course_payload := course_entry.value;
    if pg_catalog.jsonb_typeof(course_payload) <> 'object' then
      raise exception 'Every course must be a JSON object'
        using errcode = '22023';
    end if;

    begin
      course_id := nullif(course_payload ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Course % has an invalid ID', course_entry.ordinality
        using errcode = '22023';
    end;

    if course_id is null then
      raise exception 'Course % requires an ID', course_entry.ordinality
        using errcode = '22023';
    end if;
    if course_id = any(seen_course_ids) then
      raise exception 'Course % repeats an ID', course_entry.ordinality
        using errcode = '22023';
    end if;
    seen_course_ids := pg_catalog.array_append(seen_course_ids, course_id);

    course_name := pg_catalog.btrim(coalesce(course_payload ->> 'name', ''));
    course_room := nullif(pg_catalog.btrim(coalesce(course_payload ->> 'room', '')), '');
    course_teacher := nullif(pg_catalog.btrim(coalesce(course_payload ->> 'teacher', '')), '');
    course_color := pg_catalog.lower(coalesce(course_payload ->> 'color', ''));

    if char_length(course_name) not between 1 and 200
       or (course_room is not null and char_length(course_room) > 200)
       or (course_teacher is not null and char_length(course_teacher) > 120)
       or course_color !~ '^#[0-9a-f]{6}$' then
      raise exception 'Course % contains invalid text or color', course_entry.ordinality
        using errcode = '22023';
    end if;

    if coalesce(course_payload ->> 'day_of_week', '') !~ '^[1-7]$'
       or coalesce(course_payload ->> 'start_week', '') !~ '^[0-9]{1,2}$'
       or coalesce(course_payload ->> 'end_week', '') !~ '^[0-9]{1,2}$'
       or coalesce(course_payload ->> 'start_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(course_payload ->> 'end_time', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Course % contains an invalid day, week, or time', course_entry.ordinality
        using errcode = '22023';
    end if;

    course_day := (course_payload ->> 'day_of_week')::integer;
    course_start_week := (course_payload ->> 'start_week')::integer;
    course_end_week := (course_payload ->> 'end_week')::integer;
    course_start_time := (course_payload ->> 'start_time')::time;
    course_end_time := (course_payload ->> 'end_time')::time;

    if course_start_week < 1
       or course_end_week < course_start_week
       or course_end_week > p_max_weeks
       or course_end_time <= course_start_time then
      raise exception 'Course % is outside the replacement schedule bounds', course_entry.ordinality
        using errcode = '22023';
    end if;
  end loop;

  delete from public.courses course
  where course.schedule_id = p_schedule_id
    and course.user_id = actor_id;

  update public.schedules schedule
  set school = normalized_school,
      start_date = p_start_date,
      max_weeks = p_max_weeks,
      wakeup_raw = null,
      imported_at = pg_catalog.now()
  where schedule.id = p_schedule_id
    and schedule.user_id = actor_id;

  for course_entry in
    select element.value, element.ordinality
    from pg_catalog.jsonb_array_elements(p_courses) with ordinality as element(value, ordinality)
    order by element.ordinality
  loop
    course_payload := course_entry.value;
    insert into public.courses (
      id,
      schedule_id,
      user_id,
      name,
      room,
      teacher,
      day_of_week,
      start_time,
      end_time,
      start_week,
      end_week,
      color
    ) values (
      (course_payload ->> 'id')::uuid,
      p_schedule_id,
      actor_id,
      pg_catalog.btrim(course_payload ->> 'name'),
      nullif(pg_catalog.btrim(coalesce(course_payload ->> 'room', '')), ''),
      nullif(pg_catalog.btrim(coalesce(course_payload ->> 'teacher', '')), ''),
      (course_payload ->> 'day_of_week')::integer,
      (course_payload ->> 'start_time')::time,
      (course_payload ->> 'end_time')::time,
      (course_payload ->> 'start_week')::integer,
      (course_payload ->> 'end_week')::integer,
      pg_catalog.lower(course_payload ->> 'color')
    );
  end loop;

  return replacement_count;
end
$$;

revoke all on function public.replace_schedule_courses(uuid, text, date, integer, jsonb) from public;
revoke all on function public.replace_schedule_courses(uuid, text, date, integer, jsonb) from anon;
grant execute on function public.replace_schedule_courses(uuid, text, date, integer, jsonb) to authenticated;

-- Supabase projects can have explicit default routine grants in addition to
-- PostgreSQL's PUBLIC grant. Reset every public routine introduced here before
-- applying the intended allow-list, including service_role (which can access
-- the tables directly and does not need these user-facing RPCs).
revoke all on function public.handle_new_user() from anon, authenticated, service_role;
revoke all on function public.is_room_co_member(uuid) from anon, authenticated, service_role;
revoke all on function public.is_room_member_sd(uuid) from anon, authenticated, service_role;
revoke all on function public.is_room_admin_or_public_sd(uuid) from anon, authenticated, service_role;
revoke all on function public.search_profiles(text) from anon, authenticated, service_role;
revoke all on function public.accept_room_invitation(uuid) from anon, authenticated, service_role;
revoke all on function public.get_room_calendar(uuid) from anon, authenticated, service_role;
revoke all on function public.replace_schedule_courses(uuid, text, date, integer, jsonb)
  from anon, authenticated, service_role;

grant execute on function public.is_room_co_member(uuid) to authenticated;
grant execute on function public.is_room_member_sd(uuid) to authenticated;
grant execute on function public.is_room_admin_or_public_sd(uuid) to anon, authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.accept_room_invitation(uuid) to authenticated;
grant execute on function public.get_room_calendar(uuid) to anon, authenticated;
grant execute on function public.replace_schedule_courses(uuid, text, date, integer, jsonb)
  to authenticated;
