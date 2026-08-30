import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { config, query } from "./cloudflare-api.mjs";
import { parseIcs } from "../lib/utils/ics";
import * as XLSX from "xlsx";

async function main() {
  if (process.env.SMOKE_WRITES !== "yes")
    throw new Error(
      "This test creates synthetic production records and deletes ONLY those records. Run with SMOKE_WRITES=yes to opt in.",
    );
  const origin = config.vars.SITE_URL as string;
  const suffix = randomBytes(8).toString("hex"),
    password = randomBytes(32).toString("base64url");
  const cleanup: { id: string; email: string }[] = [];
  // Test-only flexible JSON assertions; no response bodies or credentials are logged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Data = Record<string, any>;
  async function raw(
    path: string,
    body?: unknown,
    cookie = "",
    requestOrigin = origin,
  ) {
    return fetch(origin + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined
          ? {}
          : {
              Origin: requestOrigin,
              ...(body instanceof FormData
                ? {}
                : { "Content-Type": "application/json" }),
            }),
        Cookie: cookie,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  }
  async function call(path: string, args?: unknown[], cookie = "") {
    const response = await raw(
      path,
      args === undefined ? undefined : { args },
      cookie,
    );
    const text = await response.text();
    assert(
      response.headers.get("content-type")?.includes("application/json"),
      path + ": expected JSON, status " + response.status,
    );
    return {
      status: response.status,
      data: JSON.parse(text) as Data,
      headers: response.headers,
    };
  }
  const proof = (salt: string) =>
    pbkdf2Sync(
      password,
      Buffer.from(salt, "hex"),
      600000,
      32,
      "sha256",
    ).toString("hex");
  async function account(label: string) {
    const email = `qa-${suffix}-${label}@example.invalid`;
    const params = await raw("auth/parameters", { email });
    assert.equal(params.status, 200);
    const { salt } = (await params.json()) as { salt: string },
      credential = {
        email,
        displayName: "Synthetic QA " + label,
        salt,
        proof: proof(salt),
      };
    const registered = await call("actions/registerAction", [credential]);
    assert.equal(registered.status, 200, registered.data.error);
    // Resolve the exact synthetic ID for cleanup even if login subsequently fails.
    const row = (
      await query("SELECT id,email FROM users WHERE email=?", [email])
    )[0].results[0];
    assert(row);
    cleanup.push(row);
    const login = await call("actions/loginAction", [credential]);
    assert.equal(login.status, 200, login.data.error);
    const cookieHeader = login.headers.get("set-cookie") || "";
    assert(cookieHeader.startsWith("__Host-bumpfree="));
    assert(
      cookieHeader.includes("HttpOnly") &&
        cookieHeader.includes("Secure") &&
        cookieHeader.includes("SameSite=Lax"),
    );
    return {
      ...row,
      cookie: cookieHeader.split(";")[0],
      credential,
      recoveryCode: registered.data.recoveryCode as string,
    };
  }
  try {
    assert.equal((await call("health")).data.storage, "D1");
    const a = await account("alice"),
      b = await account("bob"),
      admin = await account("admin");
    await query("UPDATE users SET role='superadmin' WHERE id=? AND email=?", [
      admin.id,
      admin.email,
    ]);
    assert.equal((await call("data/admin", undefined, a.cookie)).status, 403);
    assert.equal(
      (await call("data/admin", undefined, admin.cookie)).status,
      200,
    );
    assert.equal(
      (
        await raw(
          "actions/createRoom",
          { args: [{ name: "Denied" }] },
          a.cookie,
          "https://evil.invalid",
        )
      ).status,
      403,
    );
    console.log(
      "PASS production: D1 health, registration/login, secure cookies, CSRF and admin isolation",
    );
    const source = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:synthetic-${suffix}\r\nDTSTART;TZID=Asia/Shanghai:20260831T080000\r\nDTEND;TZID=Asia/Shanghai:20260831T093500\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE;TZID=Asia/Shanghai:20260907T080000\r\nSUMMARY:Synthetic Algorithms\r\nDESCRIPTION:Teacher: QA Teacher\r\nLOCATION:QA Room 101\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const parsed = parseIcs(source, {
      startDate: "2026-08-31",
      maxWeeks: 20,
      semesterTag: "Synthetic QA term",
      school: "QA",
      timezone: "Asia/Shanghai",
      importMode: "replace",
    });
    for (let i = 0; i < 2; i++) {
      const imported = await call(
        "actions/importParsedSchedule",
        [parsed],
        a.cookie,
      );
      assert.equal(imported.status, 200, imported.data.error);
    }
    const schedules = (await call("data/schedules", undefined, a.cookie)).data
      .schedules;
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].courses.length, 2);
    assert.equal(schedules[0].courses[0].teacher, "QA Teacher");
    assert.equal(schedules[0].courses[0].room, "QA Room 101");
    const full = {
      ...parsed,
      semesterTag: "Synthetic 500-course boundary",
      courses: Array.from({ length: 500 }, (_, i) => ({
        ...parsed.courses[0],
        name: "Synthetic " + i,
      })),
    };
    const boundary = await call(
      "actions/importParsedSchedule",
      [full],
      a.cookie,
    );
    assert.equal(boundary.status, 200, boundary.data.error);
    assert.equal(
      (await call("actions/setActiveSchedule", [schedules[0].id], a.cookie))
        .status,
      200,
    );
    console.log(
      "PASS production: ICS teacher/location, EXDATE, idempotent replacement and 500-record boundary",
    );
    const room = await call(
      "actions/createRoom",
      [{ name: "Synthetic QA room " + suffix }],
      a.cookie,
    );
    assert.equal(room.status, 200, room.data.error);
    const id = room.data.roomId;
    assert.equal(
      (await call("rooms/" + id + "/calendar", undefined, b.cookie)).status,
      403,
    );
    assert.equal(
      (await call("actions/inviteUserToRoom", [id, b.id], a.cookie)).status,
      200,
    );
    const invite = (await call("data/invitations", undefined, b.cookie)).data
      .invitations[0];
    assert.equal(
      (await call("actions/acceptInvitation", [invite.id], b.cookie)).status,
      200,
    );
    const member = await call("rooms/" + id + "/calendar", undefined, b.cookie);
    assert.equal(member.status, 200);
    assert.equal(member.data.members.length, 2);
    const now = Date.now();
    assert.equal(
      (
        await call(
          "actions/addBusyBlock",
          [
            {
              title: "Synthetic private busy",
              note: "synthetic private note",
              startsAt: new Date(now + 60000).toISOString(),
              endsAt: new Date(now + 3600000).toISOString(),
            },
          ],
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call("actions/updateRoom", [id, { isPublic: true }], a.cookie))
        .status,
      200,
    );
    const pub = (await call("rooms/" + id + "/calendar")).data;
    assert(!JSON.stringify(pub).includes(a.email));
    assert(!JSON.stringify(pub).includes("synthetic private note"));
    assert.equal(
      pub.members.find((m: Data) => m.user_id === a.id).busy_blocks[0].title,
      "Busy",
    );
    console.log(
      "PASS production: invitations, private/public room access and busy privacy",
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([["Synthetic", "Monday", "08:00-09:35"]]),
      "QA",
    );
    const form = new FormData();
    form.set(
      "file",
      new File(
        [XLSX.write(book, { type: "array", bookType: "xlsx" })],
        "synthetic.xlsx",
      ),
    );
    const extracted = await raw("schedule-files/extract", form, a.cookie);
    assert.equal(extracted.status, 200, "XLSX extraction in production");
    assert(
      ((await extracted.json()) as { text: string }).text.includes("Synthetic"),
    );
    const bytes = new Uint8Array(2 * 1024 * 1024).fill(65),
      upload = new FormData();
    upload.set("text", "Synthetic QA " + suffix);
    upload.set(
      "file",
      new File([bytes], "synthetic-qa.txt", { type: "text/plain" }),
    );
    const uploaded = await raw("manual-schedule-submissions", upload, a.cookie);
    assert.equal(uploaded.status, 200, "2MiB attachment upload");
    const manual = (
      await call("data/admin-settings", undefined, admin.cookie)
    ).data.manualSubmissions.find((s: Data) => s.user_id === a.id);
    assert(manual);
    const path =
      "admin/manual-schedule-submissions/" + manual.id + "/attachment";
    assert.equal((await raw(path, undefined, b.cookie)).status, 403);
    const attachment = await raw(path, undefined, admin.cookie);
    assert.equal(attachment.status, 200, "2MiB attachment download");
    assert.deepEqual(new Uint8Array(await attachment.arrayBuffer()), bytes);
    console.log(
      "PASS production: XLSX extraction and full 2MiB administrator-only attachment round trip",
    );
    const reset = await call("actions/requestPasswordResetAction", [
      {
        email: a.email,
        proof: a.credential.proof,
        recoveryCode: a.recoveryCode,
      },
    ]);
    assert.equal(reset.status, 200, reset.data.error);
    assert.equal((await call("me", undefined, a.cookie)).data.user, null);
    assert.equal(
      (
        await call("actions/requestPasswordResetAction", [
          {
            email: a.email,
            proof: a.credential.proof,
            recoveryCode: a.recoveryCode,
          },
        ])
      ).status,
      400,
    );
    console.log(
      "PASS production: recovery is one-use and revokes old sessions",
    );
    const cliEmail = `qa-${suffix}-bootstrap@example.invalid`;
    const cli = spawnSync(
      process.execPath,
      ["scripts/admin.mjs", "invite", cliEmail, "Synthetic bootstrap"],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, "Administrator bootstrap CLI failed");
    const created = (
      await query("SELECT id,email,role FROM users WHERE email=?", [cliEmail])
    )[0].results[0];
    assert(created);
    cleanup.push({ id: created.id, email: created.email });
    assert.equal(created.role, "superadmin");
    const link = cli.stdout
      .split("\n")
      .find((line) => line.startsWith(origin + "/auth/update-password/"));
    assert(link, "Expected private activation URL from administrator CLI");
    const token = new URL(link).hash.slice(7);
    const parameters = await raw("auth/invite-parameters", { token });
    assert.equal(parameters.status, 200);
    const { salt } = (await parameters.json()) as { salt: string };
    const activated = await call("actions/updatePasswordFromRecoveryAction", [
      { token, proof: proof(salt) },
    ]);
    assert.equal(activated.status, 200, activated.data.error);
    const login = await call("actions/loginAction", [
      { email: cliEmail, proof: proof(salt) },
    ]);
    assert.equal(login.status, 200);
    const duplicate = spawnSync(
      process.execPath,
      ["scripts/admin.mjs", "invite", cliEmail],
      { encoding: "utf8" },
    );
    assert.notEqual(
      duplicate.status,
      0,
      "CLI must not silently promote an active email",
    );
    console.log(
      "PASS production: administrator bootstrap CLI, activation and active-account guard",
    );
  } finally {
    for (const { id, email } of cleanup) {
      await query(
        "DELETE FROM rooms WHERE admin_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND email=?)",
        [id, id, email],
      );
      await query("DELETE FROM users WHERE id=? AND email=?", [id, email]);
      const left = (
        await query("SELECT count(*) n FROM users WHERE id=?", [id])
      )[0].results[0].n;
      assert.equal(left, 0);
    }
    console.log(
      "CLEANUP: removed only " +
        cleanup.length +
        " synthetic test accounts and their dependent records",
    );
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
