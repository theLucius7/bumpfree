import { z } from "zod";
import type { Env, UserRow, Statement } from "./types";
import type { Schedule } from "../lib/types";
import {
  validateParsedTextSchedule,
  type ParsedTextSchedule,
} from "../lib/utils/textSchedule";
import { DEFAULT_IMPORT_INTERFACES } from "../lib/utils/importInterfaces";
import { HttpError, digest, randomToken, rateLimit, saltFor } from "./security";
import { interfaces, requireAdmin, requireUser, roomAccess } from "./data";
const uuid = z.string().uuid(),
  clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const optionalText = z.preprocess(
  (v) => (v === null ? undefined : v),
  z.string().trim().max(120).optional(),
);
const slot = z
  .object({
    room: optionalText,
    dayOfWeek: z.coerce.number().int().min(1).max(7),
    startTime: clock,
    endTime: clock,
    startWeek: z.coerce.number().int().min(1).max(30),
    endWeek: z.coerce.number().int().min(1).max(30),
  })
  .refine(
    (v) => v.endTime > v.startTime && v.endWeek >= v.startWeek,
    "课程时间或周次无效",
  );
const roomInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  expiresAt: z.string().max(40).nullish(),
  isPublic: z.boolean().optional(),
});
const busyInput = z.object({
  title: z.string().trim().min(1).max(80),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  note: z.string().max(1000).optional(),
  roomId: uuid.optional(),
});
const insertCourses = `INSERT INTO courses(id,schedule_id,user_id,name,room,teacher,day_of_week,start_time,end_time,start_week,end_week,color,note)
 SELECT json_extract(value,'$.id'),?1,?2,json_extract(value,'$.name'),json_extract(value,'$.room'),json_extract(value,'$.teacher'),
 json_extract(value,'$.dayOfWeek'),json_extract(value,'$.startTime'),json_extract(value,'$.endTime'),json_extract(value,'$.startWeek'),json_extract(value,'$.endWeek'),json_extract(value,'$.color'),json_extract(value,'$.note')
 FROM json_each(?3)`;
async function ownedSchedule(env: Env, user: UserRow, id: unknown) {
  const s = await env.DB.prepare(
    "SELECT * FROM schedules WHERE id=? AND user_id=?",
  )
    .bind(uuid.parse(id), user.id)
    .first<Schedule>();
  if (!s) throw new HttpError(404, "课表不存在或无权修改");
  return s;
}
function date(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (
    !Number.isFinite(d.getTime()) ||
    d.getUTCFullYear() < 2000 ||
    d.getUTCFullYear() > 2100
  )
    throw new HttpError(400, "日期不合法");
  return d.toISOString();
}
function activeStatements(env: Env, userId: string, id: string): Statement[] {
  return [
    env.DB.prepare(
      "UPDATE schedules SET is_active=0 WHERE user_id=?1 AND EXISTS(SELECT 1 FROM schedules WHERE id=?2 AND user_id=?1)",
    ).bind(userId, id),
    env.DB.prepare(
      "UPDATE schedules SET is_active=1 WHERE id=? AND user_id=?",
    ).bind(id, userId),
  ];
}
export async function businessAction(
  name: string,
  args: unknown[],
  env: Env,
  current: UserRow | null,
) {
  const user = requireUser(current),
    first = args[0];
  if (name === "importParsedSchedule") {
    const parsed = validateParsedTextSchedule(first as ParsedTextSchedule);
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.timezone });
    } catch {
      throw new HttpError(400, "课表时区无效");
    }
    await rateLimit(env, "import:" + user.id, 30, 3600000);
    const existing = await env.DB.prepare(
      "SELECT * FROM schedules WHERE user_id=? AND semester_tag=?",
    )
      .bind(user.id, parsed.semesterTag)
      .first<Schedule>();
    const isNew = parsed.importMode === "new" || !existing;
    const id = isNew ? crypto.randomUUID() : existing!.id;
    const tag =
      parsed.importMode === "new" && existing
        ? parsed.semesterTag.slice(0, 65) +
          " (" +
          crypto.randomUUID().slice(0, 8) +
          ")"
        : parsed.semesterTag;
    const records = parsed.courses.map((c) => ({
      ...c,
      id: crypto.randomUUID(),
    }));
    const statements: Statement[] = [];
    if (isNew)
      statements.push(
        env.DB.prepare(
          "INSERT INTO schedules(id,user_id,semester_tag,school,start_date,max_weeks,timezone) VALUES(?,?,?,?,?,?,?)",
        ).bind(
          id,
          user.id,
          tag,
          parsed.school || null,
          parsed.startDate,
          parsed.maxWeeks,
          parsed.timezone,
        ),
      );
    else if (parsed.importMode === "append") {
      if (
        parsed.startDate !== existing!.start_date ||
        parsed.maxWeeks > existing!.max_weeks ||
        parsed.timezone !== existing!.timezone
      )
        throw new HttpError(
          400,
          "追加课表的起始日期、时区和周次必须与原课表一致",
        );
    } else {
      statements.push(
        env.DB.prepare(
          "DELETE FROM courses WHERE schedule_id=? AND user_id=?",
        ).bind(id, user.id),
      );
      statements.push(
        env.DB.prepare(
          "UPDATE schedules SET school=?,start_date=?,max_weeks=?,timezone=?,imported_at=? WHERE id=? AND user_id=?",
        ).bind(
          parsed.school || null,
          parsed.startDate,
          parsed.maxWeeks,
          parsed.timezone,
          new Date().toISOString(),
          id,
          user.id,
        ),
      );
    }
    if (!isNew && parsed.importMode === "append") {
      statements.push(
        env.DB.prepare(
          insertCourses +
            " WHERE EXISTS(SELECT 1 FROM schedules WHERE id=?1 AND user_id=?2 AND start_date=?4 AND max_weeks=?5 AND timezone=?6)",
        ).bind(
          id,
          user.id,
          JSON.stringify(records),
          existing!.start_date,
          existing!.max_weeks,
          existing!.timezone,
        ),
      );
    } else
      statements.push(
        env.DB.prepare(insertCourses).bind(
          id,
          user.id,
          JSON.stringify(records),
        ),
      );
    if (isNew) statements.push(...activeStatements(env, user.id, id));
    const saved = await env.DB.batch(statements);
    if (
      !isNew &&
      parsed.importMode === "append" &&
      saved.at(-1)?.meta.changes !== records.length
    )
      throw new HttpError(409, "课表基准已改变，未追加课程，请刷新后重试");
    return {
      success: true,
      scheduleId: id,
      semesterTag: tag,
      courseCount: records.length,
      importMode: parsed.importMode,
    };
  }
  if (name === "addManualCourse") {
    const input = z
      .object({
        scheduleId: uuid,
        name: z.string().trim().min(1).max(200),
        teacher: optionalText,
        slotsJson: z.string().max(20000),
      })
      .parse(first);
    const slots = z
      .array(slot)
      .min(1)
      .max(12)
      .parse(JSON.parse(input.slotsJson));
    const schedule = await ownedSchedule(env, user, input.scheduleId);
    if (slots.some((s) => s.endWeek > schedule.max_weeks))
      throw new HttpError(400, "课程周次超过课表范围");
    const rows = slots.map((s) => ({
      ...s,
      id: crypto.randomUUID(),
      name: input.name,
      teacher: input.teacher || "",
      color: "#6366f1",
    }));
    await env.DB.prepare(insertCourses)
      .bind(schedule.id, user.id, JSON.stringify(rows))
      .run();
    return { success: true, courseCount: rows.length };
  }
  if (name === "updateCourse") {
    const input = slot
      .safeExtend({
        courseId: uuid,
        scheduleId: uuid,
        name: z.string().trim().min(1).max(200),
        teacher: optionalText,
      })
      .parse(first);
    const schedule = await ownedSchedule(env, user, input.scheduleId);
    if (input.endWeek > schedule.max_weeks)
      throw new HttpError(400, "课程周次超过课表范围");
    const changed = await env.DB.prepare(
      "UPDATE courses SET schedule_id=?,name=?,room=?,teacher=?,day_of_week=?,start_time=?,end_time=?,start_week=?,end_week=? WHERE id=? AND user_id=? RETURNING id",
    )
      .bind(
        schedule.id,
        input.name,
        input.room || null,
        input.teacher || null,
        input.dayOfWeek,
        input.startTime,
        input.endTime,
        input.startWeek,
        input.endWeek,
        input.courseId,
        user.id,
      )
      .first();
    if (!changed) throw new HttpError(404, "课程不存在或无权修改");
    return { success: true };
  }
  if (name === "deleteCourse") {
    const changed = await env.DB.prepare(
      "DELETE FROM courses WHERE id=? AND user_id=? RETURNING id",
    )
      .bind(uuid.parse(first), user.id)
      .first();
    if (!changed) throw new HttpError(404, "课程不存在或无权删除");
    return { success: true };
  }
  if (name === "setActiveSchedule") {
    const schedule = await ownedSchedule(env, user, first);
    const results = await env.DB.batch(
      activeStatements(env, user.id, schedule.id),
    );
    if (!results[1].meta.changes) throw new HttpError(404, "课表不存在");
    return { success: true };
  }
  if (name === "deleteSchedule") {
    const id = uuid.parse(first);
    const results = await env.DB.batch([
      env.DB.prepare("DELETE FROM schedules WHERE id=? AND user_id=?").bind(
        id,
        user.id,
      ),
      env.DB.prepare(
        "UPDATE schedules SET is_active=1 WHERE id=(SELECT id FROM schedules WHERE user_id=?1 ORDER BY imported_at DESC,id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM schedules WHERE user_id=?1 AND is_active=1)",
      ).bind(user.id),
    ]);
    if (!results[0].meta.changes)
      throw new HttpError(404, "课表不存在或无权删除");
    return { success: true };
  }
  if (name === "createRoom") {
    const input = roomInput.parse(first),
      id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO rooms(id,admin_id,name,description,expires_at) VALUES(?,?,?,?,?)",
    )
      .bind(
        id,
        user.id,
        input.name,
        input.description || null,
        date(input.expiresAt),
      )
      .run();
    return { success: true, roomId: id };
  }
  if (name === "updateRoom" || name === "deleteRoom") {
    const id = uuid.parse(first);
    await roomAccess(env, id, user, true);
    if (name === "deleteRoom") {
      await env.DB.prepare("DELETE FROM rooms WHERE id=? AND admin_id=?")
        .bind(id, user.id)
        .run();
    } else {
      const input = roomInput.partial().parse(args[1]);
      const changes: Record<string, unknown> = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.description !== undefined)
        changes.description = input.description || null;
      if (input.expiresAt !== undefined)
        changes.expires_at = date(input.expiresAt);
      if (input.isPublic !== undefined)
        changes.is_public = input.isPublic ? 1 : 0;
      const keys = Object.keys(changes);
      if (!keys.length) throw new HttpError(400, "没有可更新的字段");
      await env.DB.prepare(
        "UPDATE rooms SET " +
          keys.map((k) => k + "=?").join(",") +
          " WHERE id=? AND admin_id=?",
      )
        .bind(...Object.values(changes), id, user.id)
        .run();
    }
    return { success: true };
  }
  if (name === "inviteUserToRoom") {
    const id = uuid.parse(first),
      invitee = uuid.parse(args[1]);
    const { room } = await roomAccess(env, id, user, true);
    if (room.expires_at && room.expires_at <= new Date().toISOString())
      throw new HttpError(400, "Room 已过期");
    if (user.id === invitee) throw new HttpError(400, "你已经是 Room 成员");
    await rateLimit(env, "invite:" + user.id, 100, 3600000);
    const member = await env.DB.prepare(
      "SELECT 1 FROM room_members WHERE room_id=? AND user_id=?",
    )
      .bind(id, invitee)
      .first();
    if (member) throw new HttpError(409, "该用户已经加入");
    await env.DB.prepare(
      "INSERT INTO invitations(id,room_id,invitee_id,inviter_id) VALUES(?,?,?,?)",
    )
      .bind(crypto.randomUUID(), id, invitee, user.id)
      .run();
    return { success: true };
  }
  if (name === "removeRoomMember") {
    const id = uuid.parse(first),
      member = uuid.parse(args[1]);
    await roomAccess(env, id, user, true);
    if (member === user.id) throw new HttpError(400, "不能移除 Room 所有者");
    const changed = await env.DB.prepare(
      "DELETE FROM room_members WHERE room_id=? AND user_id=? RETURNING user_id",
    )
      .bind(id, member)
      .first();
    if (!changed) throw new HttpError(404, "成员不存在");
    return { success: true };
  }
  if (name === "acceptInvitation" || name === "declineInvitation") {
    const id = uuid.parse(first),
      status = name === "acceptInvitation" ? "accepted" : "declined";
    const changed = await env.DB.prepare(
      "UPDATE invitations SET status=? WHERE id=? AND invitee_id=? AND status='pending' RETURNING room_id",
    )
      .bind(status, id, user.id)
      .first<{ room_id: string }>();
    if (!changed) throw new HttpError(409, "邀请不存在或已处理");
    return { success: true, roomId: changed.room_id };
  }
  if (name === "addBusyBlock" || name === "importRescheduleNotice") {
    let input: z.infer<typeof busyInput>;
    if (name === "importRescheduleNotice") {
      const n = z
        .object({
          courseName: z.string().min(1).max(77),
          startsAt: z.string(),
          endsAt: z.string(),
          teacher: z.string().max(120).optional(),
          room: z.string().max(120).optional(),
          note: z.string().max(500).optional(),
        })
        .parse(first);
      input = busyInput.parse({
        title: "调课：" + n.courseName,
        startsAt: n.startsAt,
        endsAt: n.endsAt,
        note: [n.teacher, n.room, n.note].filter(Boolean).join("\n"),
      });
    } else input = busyInput.parse(first);
    const start = date(input.startsAt)!,
      end = date(input.endsAt)!;
    if (end <= start || Date.parse(end) - Date.parse(start) > 31 * 86400000)
      throw new HttpError(400, "busy 时间应在0至31天内");
    await rateLimit(env, "busy:" + user.id, 60, 3600000);
    await env.DB.prepare(
      "INSERT INTO busy_blocks(id,user_id,title,starts_at,ends_at,note,source) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        crypto.randomUUID(),
        user.id,
        input.title,
        start,
        end,
        input.note || null,
        name === "addBusyBlock" ? "manual" : "reschedule",
      )
      .run();
    return {
      success: true,
      notice: name === "importRescheduleNotice" ? first : undefined,
    };
  }
  if (name === "deleteBusyBlock") {
    const changed = await env.DB.prepare(
      "DELETE FROM busy_blocks WHERE id=? AND user_id=? RETURNING id",
    )
      .bind(uuid.parse(first), user.id)
      .first();
    if (!changed) throw new HttpError(404, "busy 不存在或无权删除");
    return { success: true };
  }
  requireAdmin(user);
  if (name === "updateUserQuota" || name === "updateUserScheduleQuota") {
    const field = name === "updateUserQuota" ? "roomQuota" : "scheduleQuota";
    const input = z
      .object({
        userId: uuid,
        [field]: z.coerce.number().int().min(0).max(100),
      })
      .parse(first);
    const column = field === "roomQuota" ? "room_quota" : "schedule_quota";
    const changed = await env.DB.prepare(
      "UPDATE users SET " + column + "=? WHERE id=? RETURNING id",
    )
      .bind(input[field], input.userId)
      .first();
    if (!changed) throw new HttpError(404, "用户不存在");
    return { success: true };
  }
  if (name === "toggleUserRole") {
    const id = uuid.parse(first);
    if (id === user.id) throw new HttpError(400, "不能修改自己的管理员角色");
    const changed = await env.DB.prepare(
      "UPDATE users SET role=CASE role WHEN 'superadmin' THEN 'user' ELSE 'superadmin' END WHERE id=? RETURNING id",
    )
      .bind(id)
      .first();
    if (!changed) throw new HttpError(404, "用户不存在");
    return { success: true };
  }
  if (name === "bulkInviteUsers") {
    const { lines } = z
      .object({ lines: z.string().trim().min(1).max(20000) })
      .parse(first);
    const entries: { email: string; displayName: string }[] = [];
    for (const line of lines
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      const parts = line.split(",").map((s) => s.trim()),
        [email, name, amount] = parts,
        n = amount ? Number(amount) : 1;
      if (
        parts.length < 2 ||
        parts.length > 3 ||
        !Number.isInteger(n) ||
        n < 1 ||
        n > 100 ||
        entries.length + n > 100
      )
        throw new HttpError(400, "邀请列表格式不正确，单次最多100人");
      const expand = (s: string, i: number, email = false) =>
        s.includes("{n}")
          ? s.replaceAll("{n}", String(i))
          : email
            ? s.replace("@", i + "@")
            : s + i;
      for (let i = 1; i <= n; i++)
        entries.push({
          email: z
            .string()
            .email()
            .max(254)
            .parse((n === 1 ? email : expand(email, i, true)).toLowerCase()),
          displayName: z
            .string()
            .min(1)
            .max(50)
            .parse(n === 1 ? name : expand(name, i)),
        });
    }
    if (new Set(entries.map((e) => e.email)).size !== entries.length)
      throw new HttpError(400, "邀请列表含重复邮箱");
    await rateLimit(env, "admin-invites:" + user.id, 10, 86400000);
    const inviteLinks: { email: string; url: string }[] = [],
      failed: string[] = [];
    // Chunks keep each D1 batch below Free's invocation query count.
    const existing = await env.DB.prepare(
      "SELECT id,email,password_verifier,password_salt FROM users WHERE email IN (SELECT value FROM json_each(?))",
    )
      .bind(JSON.stringify(entries.map((e) => e.email)))
      .all<{
        id: string;
        email: string;
        password_verifier: string | null;
        password_salt: string;
      }>();
    const byEmail = new Map(existing.results.map((e) => [e.email, e]));
    const rows: {
      id: string;
      email: string;
      name: string;
      salt: string;
      hash: string;
    }[] = [];
    for (const e of entries) {
      const found = byEmail.get(e.email);
      if (found?.password_verifier) {
        failed.push(e.email + ":账号已激活");
        continue;
      }
      const id = found?.id || crypto.randomUUID(),
        token = randomToken();
      rows.push({
        id,
        email: e.email,
        name: e.displayName,
        salt: found?.password_salt || (await saltFor(env, e.email)),
        hash: await digest(token),
      });
      inviteLinks.push({
        email: e.email,
        url: env.SITE_URL + "/auth/update-password/#token=" + token,
      });
    }
    if (!rows.length) throw new HttpError(409, "没有可创建的新邀请");
    const json = JSON.stringify(rows);
    const issued = await env.DB.batch<{ token_hash: string; user_id: string }>([
      env.DB.prepare(
        "INSERT INTO users(id,email,display_name,password_salt) SELECT json_extract(value,'$.id'),json_extract(value,'$.email'),json_extract(value,'$.name'),json_extract(value,'$.salt') FROM json_each(?) WHERE true ON CONFLICT(email) DO NOTHING",
      ).bind(json),
      env.DB.prepare(
        "INSERT INTO auth_invites(token_hash,user_id,expires_at) SELECT json_extract(value,'$.hash'),json_extract(value,'$.id'),? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM users WHERE id=json_extract(value,'$.id') AND password_verifier IS NULL) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at RETURNING token_hash,user_id",
      ).bind(Date.now() + 7 * 86400000, json),
    ]);
    const hashes = new Set(issued[1].results.map((r) => r.token_hash));
    const actual = inviteLinks.filter((link) =>
      hashes.has(rows.find((r) => r.email === link.email)!.hash),
    );
    for (const link of inviteLinks)
      if (!actual.includes(link))
        failed.push(link.email + ":账号状态已改变，未签发邀请");
    if (!actual.length)
      throw new HttpError(409, "账号状态已改变，未签发邀请，请刷新后重试");
    return {
      success: true,
      invitedCount: actual.length,
      failed,
      inviteLinks: actual,
    };
  }
  if (name === "resetImportInterfacesToDefaults") {
    await env.DB.prepare(
      "INSERT INTO import_interfaces(id,config) SELECT json_extract(value,'$.id'),value FROM json_each(?) WHERE true ON CONFLICT(id) DO UPDATE SET config=excluded.config",
    )
      .bind(JSON.stringify(DEFAULT_IMPORT_INTERFACES))
      .run();
    return { success: true };
  }
  if (name === "updateImportInterface") {
    const input = z
      .object({
        id: z.string().min(1).max(80),
        title: z.string().min(1).max(80),
        description: z.string().min(1).max(240),
        enabled: z.string().optional(),
        sortOrder: z.coerce.number().int().min(0).max(1000),
      })
      .parse(first);
    const config = (await interfaces(env)).find((i) => i.id === input.id);
    if (!config) throw new HttpError(404, "导入接口不存在");
    await env.DB.prepare(
      "INSERT INTO import_interfaces(id,config) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config",
    )
      .bind(
        input.id,
        JSON.stringify({
          ...config,
          ...input,
          enabled: input.enabled === "on",
        }),
      )
      .run();
    return { success: true };
  }
  if (name === "uploadCustomImportInterface") {
    const schema = z.object({
      manifestVersion: z.literal(1).default(1),
      title: z.string().min(1).max(80),
      description: z.string().min(1).max(240),
      category: z.enum(["general", "school"]).default("school"),
      schoolName: z.string().max(80).optional(),
      inputLabel: z.string().max(80).optional(),
      uploadLabel: z.string().max(80).optional(),
      placeholder: z.string().max(1000).optional(),
      hints: z.array(z.string().max(160)).max(8).optional(),
      sortOrder: z.coerce.number().int().min(0).max(1000).default(500),
      aiPrompt: z.string().min(20).max(6000),
      semesterHint: z.string().max(160).optional(),
    });
    const manifest = schema.parse(first),
      id = "custom-" + crypto.randomUUID();
    const count = await env.DB.prepare(
      "SELECT count(*) n FROM import_interfaces",
    ).first<{ n: number }>();
    if ((count?.n || 0) >= 150) throw new HttpError(400, "最多150个自定义入口");
    const config = {
      ...manifest,
      id,
      adapterKey: "generic-text",
      enabled: true,
      isCustom: true,
      customMeta: {
        aiPrompt: manifest.aiPrompt,
        semesterHint: manifest.semesterHint,
        manifestVersion: 1,
        source: z.string().max(255).parse(args[1]),
      },
    };
    await env.DB.prepare("INSERT INTO import_interfaces(id,config) VALUES(?,?)")
      .bind(id, JSON.stringify(config))
      .run();
    return { success: true };
  }
  if (name === "deleteCustomImportInterface") {
    const id = z
      .string()
      .regex(/^custom-[a-z0-9\u4e00-\u9fa5-]+$/)
      .max(80)
      .parse(first);
    await env.DB.prepare("DELETE FROM import_interfaces WHERE id=?")
      .bind(id)
      .run();
    return { success: true };
  }
  if (name === "updateManualScheduleSubmission") {
    const input = z
      .object({
        id: uuid,
        status: z.enum(["pending", "processing", "done", "rejected"]),
        adminNote: z.string().max(2000),
      })
      .parse(first);
    const changed = await env.DB.prepare(
      "UPDATE manual_schedule_submissions SET status=?,admin_note=?,updated_at=? WHERE id=? RETURNING id",
    )
      .bind(
        input.status,
        input.adminNote || null,
        new Date().toISOString(),
        input.id,
      )
      .first();
    if (!changed) throw new HttpError(404, "提交不存在");
    return { success: true };
  }
  throw new HttpError(404, "操作不存在");
}
