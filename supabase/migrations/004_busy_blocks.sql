-- One-off busy blocks for manual temporary occupancy and single-class reschedule notices.

-- Helper used by room-scoped read policies.
create or replace function public.is_room_co_member(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$ select private.is_room_co_member(target_user_id) $$;

revoke all on function public.is_room_co_member(uuid) from public;
grant execute on function public.is_room_co_member(uuid) to authenticated;

create table if not exists public.busy_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Busy',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  source text not null default 'manual' check (source in ('manual', 'reschedule')),
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);

create index if not exists busy_blocks_user_time_idx on public.busy_blocks (user_id, starts_at, ends_at);
create index if not exists busy_blocks_user_created_idx on public.busy_blocks (user_id, created_at);

alter table public.busy_blocks enable row level security;

create policy "busy_blocks_select_own" on public.busy_blocks for select using (auth.uid() = user_id);
create policy "busy_blocks_select_room_member" on public.busy_blocks for select using (public.is_room_co_member(user_id));
create policy "busy_blocks_insert_own" on public.busy_blocks for insert with check (auth.uid() = user_id);
create policy "busy_blocks_update_own" on public.busy_blocks for update using (auth.uid() = user_id);
create policy "busy_blocks_delete_own" on public.busy_blocks for delete using (auth.uid() = user_id);
