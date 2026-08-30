import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { builtinModules } from "node:module";
import { unstable_splitSqlQuery as splitSql } from "wrangler";
import type { Env } from "../worker/types";
async function main() {
  const site = "https://bumpfree.test",
    pepper = randomBytes(32).toString("hex");
  const external = [
    ...new Set(
      builtinModules.flatMap((m) => [
        m,
        m.startsWith("node:") ? m : "node:" + m,
      ]),
    ),
  ];
  const built = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    external,
    minify: true,
    legalComments: "none",
    banner: {
      js: 'import {createRequire as __testCreateRequire} from "node:module";var require=__testCreateRequire("/");',
    },
  });
  const mf = new Miniflare({
    d1Persist: false,
    workers: [
      {
        name: "test",
        modules: true,
        script: built.outputFiles[0].text,
        d1Databases: { DB: "test" },
        compatibilityDate: "2026-08-01",
        compatibilityFlags: ["nodejs_compat"],
        bindings: { AUTH_PEPPER: pepper, SITE_URL: site },
      },
    ],
  });
  const DB = await mf.getD1Database("DB");
  const env: Env = {
    DB: DB as unknown as Env["DB"],
    AUTH_PEPPER: pepper,
    SITE_URL: site,
  };
  // The real application runs inside workerd, not as a direct Node function call.
  // Preserve Request-generated multipart boundaries while crossing runtimes.
  const worker = {
    async fetch(request: Request, environment: Env) {
      assert.equal(environment.SITE_URL, site);
      return mf.dispatchFetch(request.url, {
        method: request.method,
        headers: Object.fromEntries(request.headers),
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : await request.arrayBuffer(),
      });
    },
  };
  const password = "Synthetic test password 2026!";
  // Test-only dynamic wire assertions; production schemas use Zod and typed records.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Result = Record<string, any>;
  async function request(
    path: string,
    args?: unknown[],
    cookie = "",
    origin = env.SITE_URL,
  ) {
    const res = await worker.fetch(
      new Request(env.SITE_URL + "/api/" + path, {
        method: args ? "POST" : "GET",
        headers: {
          ...(args
            ? { "Content-Type": "application/json", Origin: origin }
            : {}),
          Cookie: cookie,
        },
        body: args ? JSON.stringify({ args }) : undefined,
      }),
      env,
    );
    return {
      status: res.status,
      data: (await res.json()) as Result,
      cookie: res.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  async function params(email: string) {
    const r = await worker.fetch(
      new Request(env.SITE_URL + "/api/auth/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: env.SITE_URL },
        body: JSON.stringify({ email }),
      }),
      env,
    );
    assert.equal(r.status, 200);
    return (await r.json()) as { salt: string };
  }
  const proof = (salt: string, pass = password) =>
    pbkdf2Sync(pass, Buffer.from(salt, "hex"), 600000, 32, "sha256").toString(
      "hex",
    );
  async function account(email: string, displayName: string) {
    const { salt } = await params(email);
    const credential = { email, salt, proof: proof(salt), displayName };
    const reg = await request("actions/registerAction", [credential]);
    assert.equal(reg.status, 200, reg.data.error);
    const login = await request("actions/loginAction", [credential]);
    assert.equal(login.status, 200, login.data.error);
    const me = await request("me", undefined, login.cookie);
    return {
      ...credential,
      cookie: login.cookie,
      id: me.data.user.id as string,
      code: reg.data.recoveryCode as string,
    };
  }
  const parsed = (name: string, count = 1) => ({
    format: "strict",
    semesterTag: name,
    startDate: "2026-08-31",
    maxWeeks: 20,
    school: "QA",
    timezone: "Asia/Shanghai",
    importMode: "replace",
    warnings: [],
    courses: Array.from({ length: count }, (_, i) => ({
      name: "Synthetic course " + i,
      teacher: "Test Teacher",
      room: "Test 101",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "09:35",
      startWeek: 1,
      endWeek: 16,
      color: "#6366f1",
    })),
  });
  try {
    for (const name of readdirSync("worker/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort())
      for (const sql of splitSql(
        readFileSync("worker/migrations/" + name, "utf8"),
      ))
        await DB.prepare(sql).run();
    const a = await account("alice@example.invalid", "Alice"),
      b = await account("bob@example.invalid", "Bob"),
      admin = await account("admin@example.invalid", "Admin");
    await DB.prepare("UPDATE users SET role='superadmin' WHERE id=?")
      .bind(admin.id)
      .run();
    assert.equal(
      (
        await request(
          "actions/createRoom",
          [{ name: "evil" }],
          a.cookie,
          "https://evil.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("data/admin", undefined, a.cookie)).status,
      403,
    );
    assert.equal(
      (await request("data/admin", undefined, admin.cookie)).data.stats
        .userCount,
      3,
    );
    assert.equal(
      (
        await request("actions/loginAction", [
          { email: a.email, proof: b.proof },
        ])
      ).status,
      401,
    );
    const fake1 = await params("unknown@example.invalid"),
      fake2 = await params("unknown@example.invalid");
    assert.equal(fake1.salt, fake2.salt);
    console.log(
      "PASS authentication, CSRF, stable fake salts, admin isolation",
    );
    const room = await request(
      "actions/createRoom",
      [{ name: "QA private room", description: "synthetic" }],
      a.cookie,
    );
    assert.equal(room.status, 200, room.data.error);
    const roomId = room.data.roomId;
    assert.equal(
      (await request("rooms/" + roomId + "/calendar", undefined, b.cookie))
        .status,
      403,
    );
    assert.equal((await request("rooms/" + roomId + "/calendar")).status, 401);
    assert.equal(
      (
        await request(
          "actions/updateRoom",
          [roomId, { isPublic: true }],
          b.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("actions/inviteUserToRoom", [roomId, b.id], a.cookie))
        .status,
      200,
    );
    const invitations = await request("data/invitations", undefined, b.cookie);
    assert.equal(invitations.data.invitations[0].room.name, "QA private room");
    const invitationId = invitations.data.invitations[0].id;
    const accepts = await Promise.all([
      request("actions/acceptInvitation", [invitationId], b.cookie),
      request("actions/acceptInvitation", [invitationId], b.cookie),
    ]);
    assert.deepEqual(accepts.map((r) => r.status).sort(), [200, 409]);
    const members = await request(
      "rooms/" + roomId + "/members",
      undefined,
      a.cookie,
    );
    assert.equal(members.data.members.length, 2);
    assert.equal(
      (await request("actions/removeRoomMember", [roomId, a.id], a.cookie))
        .status,
      400,
    );
    console.log(
      "PASS private rooms, invitation metadata, atomic double accept, owner protection",
    );
    const calendar = await request(
      "actions/importParsedSchedule",
      [parsed("Synthetic term")],
      a.cookie,
    );
    assert.equal(calendar.status, 200, calendar.data.error);
    const same = await request(
      "actions/importParsedSchedule",
      [parsed("Synthetic term")],
      a.cookie,
    );
    assert.equal(same.status, 200, same.data.error);
    let schedules = (await request("data/schedules", undefined, a.cookie)).data
      .schedules;
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].courses.length, 1);
    const scheduleId = schedules[0].id,
      courseId = schedules[0].courses[0].id;
    assert.equal(
      (await request("actions/deleteCourse", [courseId], b.cookie)).status,
      404,
    );
    assert.equal(
      (await request("actions/deleteSchedule", [scheduleId], b.cookie)).status,
      404,
    );
    const bad = parsed("Synthetic term");
    bad.courses[0].endWeek = 99;
    assert.equal(
      (await request("actions/importParsedSchedule", [bad], a.cookie)).status,
      400,
    );
    assert.equal(
      (await request("data/schedules", undefined, a.cookie)).data.schedules[0]
        .courses.length,
      1,
    );
    await DB.prepare(
      "CREATE TRIGGER test_late_failure BEFORE INSERT ON courses WHEN NEW.name='Late failure' BEGIN SELECT RAISE(ABORT,'COURSE_LIMIT'); END",
    ).run();
    const late = parsed("Synthetic term", 2);
    late.maxWeeks = 25;
    late.courses[1].name = "Late failure";
    assert.equal(
      (await request("actions/importParsedSchedule", [late], a.cookie)).status,
      409,
    );
    const restored = (await request("data/schedules", undefined, a.cookie)).data
      .schedules[0];
    assert.equal(restored.max_weeks, 20);
    assert.equal(restored.courses.length, 1);
    assert.equal(restored.courses[0].id, courseId);
    assert.equal(restored.is_active, true);
    await DB.prepare("DROP TRIGGER test_late_failure").run();
    const full = await request(
      "actions/importParsedSchedule",
      [parsed("Full term", 500)],
      a.cookie,
    );
    assert.equal(full.status, 200, full.data.error);
    const move = await request(
      "actions/updateCourse",
      [
        {
          courseId,
          scheduleId: full.data.scheduleId,
          name: "Moved",
          teacher: "",
          room: "",
          dayOfWeek: 1,
          startTime: "08:00",
          endTime: "09:00",
          startWeek: 1,
          endWeek: 2,
        },
      ],
      a.cookie,
    );
    assert.equal(move.status, 409, move.data.error);
    await request(
      "actions/importParsedSchedule",
      [parsed("Third term")],
      a.cookie,
    );
    assert.equal(
      (
        await request(
          "actions/importParsedSchedule",
          [parsed("Fourth term")],
          a.cookie,
        )
      ).status,
      409,
    );
    schedules = (await request("data/schedules", undefined, a.cookie)).data
      .schedules;
    assert.equal(schedules.filter((s: Result) => s.is_active).length, 1);
    await request(
      "actions/deleteSchedule",
      [schedules.find((s: Result) => s.is_active).id],
      a.cookie,
    );
    assert.equal(
      (
        await request("data/schedules", undefined, a.cookie)
      ).data.schedules.filter((s: Result) => s.is_active).length,
      1,
    );
    console.log(
      "PASS idempotent imports, ownership, rollback, 500-course limit and move, quotas, active schedule fallback",
    );
    const now = Date.now();
    await request(
      "actions/addBusyBlock",
      [
        {
          title: "private appointment",
          note: "never expose",
          startsAt: new Date(now + 60000).toISOString(),
          endsAt: new Date(now + 3600000).toISOString(),
        },
      ],
      a.cookie,
    );
    await request("actions/updateRoom", [roomId, { isPublic: true }], a.cookie);
    const pub = await request("rooms/" + roomId + "/calendar");
    assert.equal(pub.status, 200);
    const block = pub.data.members.find((m: Result) => m.user_id === a.id)
      .busy_blocks[0];
    assert.equal(block.title, "Busy");
    assert.equal(block.note, null);
    assert(!JSON.stringify(pub.data).includes(a.email));
    assert(!JSON.stringify(pub.data).includes("password_verifier"));
    const memberCal = await request(
      "rooms/" + roomId + "/calendar",
      undefined,
      b.cookie,
    );
    assert.equal(
      memberCal.data.members.find((m: Result) => m.user_id === a.id)
        .busy_blocks[0].note,
      "never expose",
    );
    await request(
      "actions/updateRoom",
      [roomId, { expiresAt: "2025-01-01T00:00:00Z" }],
      a.cookie,
    );
    assert.equal((await request("rooms/" + roomId + "/calendar")).status, 401);
    assert.equal(
      (await request("rooms/" + roomId + "/calendar", undefined, b.cookie))
        .status,
      200,
    );
    console.log("PASS public privacy projection and expired room access");
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(65),
      form = new FormData();
    form.set("text", "QA attachment");
    form.set("file", new File([bytes], "qa.txt", { type: "text/plain" }));
    const uploaded = await worker.fetch(
      new Request(env.SITE_URL + "/api/manual-schedule-submissions", {
        method: "POST",
        headers: { Origin: env.SITE_URL, Cookie: a.cookie },
        body: form,
      }),
      env,
    );
    assert.equal(uploaded.status, 200, JSON.stringify(await uploaded.json()));
    const manual = (
      await request("data/admin-settings", undefined, admin.cookie)
    ).data.manualSubmissions[0];
    const path =
      "admin/manual-schedule-submissions/" + manual.id + "/attachment";
    assert.equal(
      (
        await worker.fetch(
          new Request(env.SITE_URL + "/api/" + path, {
            headers: { Cookie: b.cookie },
          }),
          env,
        )
      ).status,
      403,
    );
    const download = await worker.fetch(
      new Request(env.SITE_URL + "/api/" + path, {
        headers: { Cookie: admin.cookie },
      }),
      env,
    );
    assert.equal(download.status, 200);
    assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
    assert(
      download.headers.get("content-disposition")?.startsWith("attachment"),
    );
    console.log(
      "PASS full 2MiB attachment round trip and administrator-only download",
    );
    const newProof = proof(a.salt, "Another synthetic password 2026!");
    const recover = await Promise.all([
      request("actions/requestPasswordResetAction", [
        { email: a.email, proof: newProof, recoveryCode: a.code },
      ]),
      request("actions/requestPasswordResetAction", [
        { email: a.email, proof: newProof, recoveryCode: a.code },
      ]),
    ]);
    assert.deepEqual(recover.map((r) => r.status).sort(), [200, 400]);
    assert.equal((await request("me", undefined, a.cookie)).data.user, null);
    const fresh = await request("actions/loginAction", [
      { email: a.email, proof: newProof },
    ]);
    assert.equal(fresh.status, 200);
    const changed = await request(
      "actions/updateAuthAction",
      [{ email: "alice-new@example.invalid", currentProof: newProof }],
      fresh.cookie,
    );
    assert.equal(changed.status, 200);
    assert.equal((await params("alice-new@example.invalid")).salt, a.salt);
    assert.equal(
      (
        await request("actions/loginAction", [
          { email: "alice-new@example.invalid", proof: newProof },
        ])
      ).status,
      200,
    );
    const inv = await request(
      "actions/bulkInviteUsers",
      [{ lines: "invited@example.invalid,Invited" }],
      admin.cookie,
    );
    assert.equal(inv.status, 200, inv.data.error);
    const token = new URL(inv.data.inviteLinks[0].url).hash.slice(7);
    const pending = (await DB.prepare(
      "SELECT id,password_salt FROM users WHERE email=?",
    )
      .bind("invited@example.invalid")
      .first())!;
    await DB.prepare("UPDATE auth_invites SET expires_at=0 WHERE user_id=?")
      .bind(pending.id)
      .run();
    const reissued = await request(
      "actions/bulkInviteUsers",
      [{ lines: "invited@example.invalid,Invited" }],
      admin.cookie,
    );
    assert.equal(reissued.status, 200, reissued.data.error);
    const newToken = new URL(reissued.data.inviteLinks[0].url).hash.slice(7);
    assert.notEqual(newToken, token);
    const samePending = (await DB.prepare(
      "SELECT id,password_salt FROM users WHERE email=?",
    )
      .bind("invited@example.invalid")
      .first())!;
    assert.equal(samePending.id, pending.id);
    assert.equal(samePending.password_salt, pending.password_salt);
    const salt = (await params("invited@example.invalid")).salt;
    assert.equal(
      (
        await request("actions/updatePasswordFromRecoveryAction", [
          { token, proof: proof(salt) },
        ])
      ).status,
      400,
    );
    const activation = await Promise.all([
      request("actions/updatePasswordFromRecoveryAction", [
        { token: newToken, proof: proof(salt) },
      ]),
      request("actions/updatePasswordFromRecoveryAction", [
        { token: newToken, proof: proof(salt) },
      ]),
    ]);
    assert.equal(activation.filter((r) => r.status === 200).length, 1);
    console.log(
      "PASS single-use recovery/activation, expired invitation reissue, immediate session revocation, email changes keep salt",
    );
    assert.equal(
      (await request("actions/deleteRoom", [roomId], a.cookie)).status,
      401,
    );
    const login = await request("actions/loginAction", [
      { email: "alice-new@example.invalid", proof: newProof },
    ]);
    const deleted = await request("actions/deleteRoom", [roomId], login.cookie);
    assert.equal(deleted.status, 200, deleted.data.error);
    assert.equal(
      (await request("rooms/" + roomId + "/calendar", undefined, b.cookie))
        .status,
      404,
    );
    console.log("PASS room deletion and cascades");
  } finally {
    await mf.dispose();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
