-- DESTRUCTIVE MANUAL RECOVERY SCRIPT.
--
-- This file is intentionally outside supabase/migrations. It deletes all
-- BumpFree application data and must never be run by an automated migration
-- command. Take a verified backup and require an explicit operator decision
-- before running it, then apply the complete migration chain again.

begin;

drop table if exists public.manual_schedule_submissions cascade;
drop table if exists public.import_interfaces cascade;
drop table if exists public.busy_blocks cascade;
drop table if exists public.invitations cascade;
drop table if exists public.room_members cascade;
drop table if exists public.rooms cascade;
drop table if exists public.courses cascade;
drop table if exists public.schedules cascade;
drop table if exists public.profiles cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.accept_room_invitation(uuid);
drop function if exists public.get_room_calendar(uuid);
drop function if exists public.search_profiles(text);
drop function if exists public.replace_schedule_courses(uuid, text, date, integer, jsonb);
drop function if exists public.handle_new_user();
drop function if exists public.is_room_co_member(uuid);
drop function if exists public.is_room_member_sd(uuid);
drop function if exists public.is_room_admin_or_public_sd(uuid);

drop function if exists private.guard_busy_block_write();
drop function if exists private.guard_manual_submission_insert();
drop function if exists private.manual_attachment_is_valid(text, text, integer, text);
drop function if exists private.guard_invitation_update();
drop function if exists private.enforce_room_quota();
drop function if exists private.enforce_schedule_quota();
drop function if exists private.set_single_active_schedule();
drop function if exists private.prevent_invalid_schedule_shrink();
drop function if exists private.enforce_course_schedule_integrity();
drop function if exists private.protect_profile_privileged_fields();
drop function if exists private.is_invitation_related(uuid);
drop function if exists private.has_pending_room_invitation(uuid);
drop function if exists private.can_manage_room(uuid);
drop function if exists private.is_room_owner(uuid);
drop function if exists private.is_room_admin_or_public_sd(uuid);
drop function if exists private.is_room_member_sd(uuid);
drop function if exists private.is_room_co_member(uuid);
drop function if exists private.is_superadmin(uuid);
drop table if exists private.security_quarantine;

commit;
