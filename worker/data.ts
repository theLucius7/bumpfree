import type { Env, UserRow } from "./types";
import type { Schedule, Course, Room, BusyBlock } from "../lib/types";
import {
  normalizeImportInterfaces,
  type ImportInterfaceConfig,
} from "../lib/utils/importInterfaces";
import { HttpError, publicMe } from "./security";
import { getMalaysiaPublicHolidays } from "../lib/utils/holidays";
export function requireUser(user: UserRow | null): UserRow {
  if (!user) throw new HttpError(401, "请先登录");
  return user;
}
export function requireAdmin(user: UserRow | null): UserRow {
  const u = requireUser(user);
  if (u.role !== "superadmin") throw new HttpError(403, "需要管理员权限");
  return u;
}
export async function interfaces(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT config FROM import_interfaces LIMIT 200",
  ).all<{ config: string }>();
  return normalizeImportInterfaces(
    results.map((row) => JSON.parse(row.config) as ImportInterfaceConfig),
  );
}
export async function dataView(name: string, env: Env, user: UserRow | null) {
  const u = requireUser(user),
    me = publicMe(u);
  if (name === "dashboard") {
    const stats = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM rooms WHERE admin_id=?1) roomCount,(SELECT count(*) FROM schedules WHERE user_id=?1) scheduleCount,(SELECT count(*) FROM invitations WHERE invitee_id=?1 AND status='pending') invitationCount",
    )
      .bind(u.id)
      .first();
    const { results } = await env.DB.prepare(
      "SELECT r.* FROM room_members m JOIN rooms r ON r.id=m.room_id WHERE m.user_id=? ORDER BY r.created_at DESC LIMIT 5",
    )
      .bind(u.id)
      .all<Room>();
    return {
      ...me,
      ...stats,
      memberRooms: results.map((room) => ({
        room: { ...room, is_public: Boolean(room.is_public) },
      })),
    };
  }
  if (name === "schedules") {
    const lists = await env.DB.batch([
      env.DB.prepare(
        "SELECT * FROM schedules WHERE user_id=? ORDER BY imported_at DESC",
      ).bind(u.id),
      env.DB.prepare(
        "SELECT * FROM courses WHERE user_id=? ORDER BY day_of_week,start_time,start_week",
      ).bind(u.id),
    ]);
    const courses = lists[1].results as unknown as Course[];
    return {
      ...me,
      schedules: lists[0].results.map((s) => ({
        ...s,
        is_active: Boolean(s.is_active),
        courses: courses.filter((c) => c.schedule_id === s.id),
      })),
      importInterfaces: (await interfaces(env)).filter((i) => i.enabled),
    };
  }
  if (name === "rooms") {
    const { results } = await env.DB.prepare(
      "SELECT r.*, (SELECT count(*) FROM room_members m WHERE m.room_id=r.id) member_count FROM rooms r WHERE admin_id=? ORDER BY created_at DESC",
    )
      .bind(u.id)
      .all<Room & { member_count: number }>();
    return {
      ...me,
      rooms: results.map((r) => ({
        ...r,
        is_public: Boolean(r.is_public),
        room_members: [{ count: r.member_count }],
      })),
    };
  }
  if (name === "invitations") {
    const { results } = await env.DB.prepare(
      "SELECT i.*,r.name room_name,r.description room_description,u.display_name inviter_name FROM invitations i JOIN rooms r ON r.id=i.room_id JOIN users u ON u.id=i.inviter_id WHERE i.invitee_id=? AND i.status='pending' ORDER BY i.created_at DESC",
    )
      .bind(u.id)
      .all();
    return {
      invitations: results.map((i) => ({
        ...i,
        room: {
          id: i.room_id,
          name: i.room_name,
          description: i.room_description,
        },
        inviter: { id: i.inviter_id, display_name: i.inviter_name },
      })),
    };
  }
  requireAdmin(u);
  if (name === "admin") {
    const { results: users } = await env.DB.prepare(
      "SELECT id,email,display_name,role,room_quota,schedule_quota,created_at FROM users ORDER BY created_at DESC LIMIT 1000",
    ).all();
    const stats = await env.DB.prepare(
      "SELECT (SELECT count(*) FROM users) userCount,(SELECT count(*) FROM rooms) roomCount",
    ).first();
    return { ...me, users, stats };
  }
  if (name === "admin-settings") {
    const { results } = await env.DB.prepare(
      "SELECT s.*,u.display_name FROM manual_schedule_submissions s JOIN users u ON u.id=s.user_id WHERE s.status IN ('pending','processing') ORDER BY s.created_at DESC LIMIT 25",
    ).all();
    return {
      importInterfaces: await interfaces(env),
      manualSubmissions: results.map((s) => ({
        ...s,
        profile: { display_name: s.display_name },
      })),
    };
  }
  throw new HttpError(404, "页面数据不存在");
}
export async function roomAccess(
  env: Env,
  id: string,
  user: UserRow | null,
  manage = false,
) {
  const room = await env.DB.prepare("SELECT * FROM rooms WHERE id=?")
    .bind(id)
    .first<Room>();
  if (!room) throw new HttpError(404, "Room 不存在");
  const isMember = user
    ? Boolean(
        await env.DB.prepare(
          "SELECT 1 FROM room_members WHERE room_id=? AND user_id=?",
        )
          .bind(id, user.id)
          .first(),
      )
    : false;
  if (manage && room.admin_id !== user?.id)
    throw new HttpError(403, "只有 Room 管理员可以执行此操作");
  if (
    !isMember &&
    (!room.is_public ||
      (room.expires_at && room.expires_at <= new Date().toISOString()))
  )
    throw new HttpError(user ? 403 : 401, "该 Room 为私密房间或公开分享已过期");
  return { room: { ...room, is_public: Boolean(room.is_public) }, isMember };
}
export async function roomCalendar(env: Env, id: string, user: UserRow | null) {
  const { room, isMember } = await roomAccess(env, id, user);
  const lists = await env.DB.batch([
    env.DB.prepare(
      "SELECT m.user_id,m.color,m.joined_at,u.display_name FROM room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at,m.user_id",
    ).bind(id),
    env.DB.prepare(
      "SELECT s.* FROM schedules s JOIN room_members m ON m.user_id=s.user_id WHERE m.room_id=? AND s.is_active=1",
    ).bind(id),
    env.DB.prepare(
      "SELECT c.* FROM courses c JOIN schedules s ON s.id=c.schedule_id JOIN room_members m ON m.user_id=c.user_id WHERE m.room_id=? AND s.is_active=1",
    ).bind(id),
    env.DB.prepare(
      "SELECT b.* FROM busy_blocks b JOIN room_members m ON m.user_id=b.user_id WHERE m.room_id=? AND b.ends_at>? AND b.starts_at<?",
    ).bind(
      id,
      new Date(Date.now() - 366 * 86400000).toISOString(),
      new Date(Date.now() + 366 * 86400000).toISOString(),
    ),
  ]);
  const courses = lists[2].results as unknown as Course[],
    busy = lists[3].results as unknown as BusyBlock[];
  const schedules = lists[1].results as unknown as Schedule[];
  const members = lists[0].results.map((m) => {
    const schedule = schedules.find((s) => s.user_id === m.user_id);
    return {
      ...m,
      schedule: schedule
        ? {
            ...schedule,
            courses: courses
              .filter((c) => c.schedule_id === schedule.id)
              .map(
                ({
                  id,
                  name,
                  room,
                  teacher,
                  day_of_week,
                  start_time,
                  end_time,
                  start_week,
                  end_week,
                  color,
                  note,
                }) => ({
                  id,
                  name,
                  room,
                  teacher,
                  day_of_week,
                  start_time,
                  end_time,
                  start_week,
                  end_week,
                  color,
                  note,
                }),
              ),
          }
        : null,
      busy_blocks: busy
        .filter((b) => b.user_id === m.user_id)
        .map((b) => ({
          id: b.id,
          title: isMember ? b.title : "Busy",
          starts_at: b.starts_at,
          ends_at: b.ends_at,
          note: isMember ? b.note : null,
          source: b.source,
        })),
    };
  });
  const usesMalaysia = schedules.some((s) =>
    /xmum|malaysia|马来西亚|厦马/i.test(s.school || ""),
  );
  const years = schedules.flatMap((s) => [
    Number(s.start_date.slice(0, 4)),
    Number(s.start_date.slice(0, 4)) + 1,
  ]);
  return {
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      is_public: room.is_public,
      expires_at: room.expires_at,
    },
    members,
    currentUserId: user?.id || null,
    isMember,
    holidays: usesMalaysia
      ? await getMalaysiaPublicHolidays([...new Set(years)])
      : [],
  };
}
