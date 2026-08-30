import { z } from "zod";
import type { Env } from "./types";
import { authAction, authParameters } from "./auth";
import { businessAction } from "./actions";
import { dataView, requireUser, roomAccess, roomCalendar } from "./data";
import { attachmentResponse, upload } from "./uploads";
import {
  currentUser,
  digest,
  HttpError,
  publicMe,
  rateLimit,
  readBody,
  trustedMutation,
} from "./security";
const constraintErrors: Record<string, string> = {
  ROOM_QUOTA: "已达到 Room 创建额度",
  SCHEDULE_QUOTA: "已达到课表保存额度",
  COURSE_LIMIT: "每份课表最多500条记录；未更改原课表",
  COURSE_WEEKS: "课程周次超过课表范围",
  ROOM_OWNER: "不能移除房间所有者",
  ROOM_EXPIRED: "Room 已过期",
  MEMBER_LIMIT: "每个Room最多50名成员",
  LAST_ADMIN: "必须保留至少一名管理员",
  INVITATION_STATE: "邀请已处理",
  BUSY_LIMIT: "最多保存1000条busy记录",
  MANUAL_LIMIT: "最多保留5条待处理提交",
};
const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    });
    headers.set("Strict-Transport-Security", "max-age=31536000");
    const url = new URL(request.url),
      path = url.pathname.replace(/\/$/, "");
    try {
      if (!path.startsWith("/api/")) throw new HttpError(404, "API 不存在");
      if (request.method !== "GET" && request.method !== "POST")
        throw new HttpError(405, "不支持此请求方法");
      const ip = request.headers.get("cf-connecting-ip") || "local";
      if (request.method === "POST") {
        trustedMutation(request, env);
        const isAuth =
          path.startsWith("/api/auth/") ||
          /\/actions\/(loginAction|registerAction|requestPasswordResetAction|updatePasswordFromRecoveryAction)$/.test(
            path,
          );
        await rateLimit(
          env,
          (isAuth ? "auth-ip:" : "write-ip:") + ip,
          isAuth ? 80 : 600,
          900000,
        );
      }
      if (path === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1 FROM users LIMIT 1").first();
        return Response.json(
          { ok: true, storage: "D1", version: "2.0.0" },
          { headers },
        );
      }
      const user = await currentUser(request, env);
      let value: unknown;
      if (request.method === "GET") {
        if (path === "/api/me") value = publicMe(user);
        else if (path.startsWith("/api/data/"))
          value = await dataView(path.slice(10), env, user);
        else if (path === "/api/users/search") {
          const u = requireUser(user);
          await rateLimit(env, "search:" + u.id, 60, 60000);
          const q = (url.searchParams.get("q") || "")
            .trim()
            .replace(/[%_\\]/g, "");
          const users =
            q.length < 2 || q.length > 50
              ? []
              : (
                  await env.DB.prepare(
                    "SELECT id,display_name FROM users WHERE id!=? AND display_name LIKE ? ORDER BY display_name LIMIT 15",
                  )
                    .bind(u.id, q + "%")
                    .all()
                ).results;
          value = { users };
        } else if (
          /^\/api\/rooms\/[a-f0-9-]+\/(calendar|members)$/.test(path)
        ) {
          const id = z.string().uuid().parse(path.split("/")[3]);
          if (path.endsWith("/calendar"))
            value = await roomCalendar(env, id, user);
          else {
            requireUser(user);
            const access = await roomAccess(env, id, user);
            if (!access.isMember)
              throw new HttpError(403, "只有成员可以查看成员管理列表");
            const { results } = await env.DB.prepare(
              "SELECT m.*,u.display_name FROM room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at",
            )
              .bind(id)
              .all();
            value = {
              members: results.map((m) => ({
                ...m,
                profile: { id: m.user_id, display_name: m.display_name },
              })),
            };
          }
        } else if (
          /^\/api\/admin\/manual-schedule-submissions\/[a-f0-9-]+\/attachment$/.test(
            path,
          )
        ) {
          return await attachmentResponse(
            env,
            user,
            z.string().uuid().parse(path.split("/")[4]),
          );
        } else throw new HttpError(404, "API 不存在");
      } else if (
        path === "/api/manual-schedule-submissions" ||
        path === "/api/schedule-files/extract"
      )
        value = await upload(request, env, user, path.endsWith("/extract"));
      else {
        if (
          !request.headers.get("content-type")?.startsWith("application/json")
        )
          throw new HttpError(415, "请求必须使用JSON");
        const raw = await readBody(request, 1500000);
        let body;
        try {
          body = JSON.parse(new TextDecoder().decode(raw));
        } catch {
          throw new HttpError(400, "JSON格式不正确");
        }
        if (path === "/api/auth/parameters")
          value = await authParameters(env, body);
        else if (path === "/api/auth/invite-parameters") {
          const { token } = z
            .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
            .parse(body);
          const row = await env.DB.prepare(
            "SELECT u.email,u.password_salt salt FROM auth_invites i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.expires_at>? AND u.password_verifier IS NULL",
          )
            .bind(await digest(token), Date.now())
            .first();
          if (!row) throw new HttpError(400, "激活链接无效、已使用或已过期");
          value = row;
        } else if (path.startsWith("/api/actions/")) {
          const { args } = z
              .object({ args: z.array(z.unknown()).max(5) })
              .parse(body),
            name = path.slice(13);
          value =
            (await authAction(name, args, env, user, headers)) ??
            (await businessAction(name, args, env, user));
        } else throw new HttpError(404, "API 不存在");
      }
      return Response.json(value, { headers });
    } catch (error) {
      let status = 500,
        message = "服务暂不可用，请稍后重试";
      if (error instanceof HttpError) {
        status = error.status;
        message = error.message;
      } else if (error instanceof z.ZodError) {
        status = 400;
        message = "输入格式不正确，请检查必填字段、长度和时间";
      } else {
        const text = String(error);
        const constraint = Object.keys(constraintErrors).find((k) =>
          text.includes(k),
        );
        if (constraint) {
          status = 409;
          message = constraintErrors[constraint];
        } else if (/UNIQUE constraint/.test(text)) {
          status = 409;
          message = "该记录已存在，请刷新后重试";
        } else if (/FOREIGN KEY|CHECK constraint/.test(text)) {
          status = 400;
          message = "关联记录或数据范围不合法，未保存更改";
        } else if (
          error instanceof Error &&
          !/D1|SQL|database|fetch|internal/i.test(text)
        ) {
          status = 400;
          message = error.message.slice(0, 200);
        }
      }
      return Response.json({ error: message }, { status, headers });
    }
  },
  async scheduled(_event: unknown, env: Env) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(
        Date.now(),
      ),
      env.DB.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(
        Date.now() - 86400000,
      ),
      env.DB.prepare("DELETE FROM auth_invites WHERE expires_at<?").bind(
        Date.now(),
      ),
    ]);
  },
};
export default worker;
