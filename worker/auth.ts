import { z } from "zod";
import type { Env, UserRow } from "./types";
import {
  HttpError,
  ITERATIONS,
  checkProof,
  digest,
  publicMe,
  randomToken,
  rateLimit,
  recoveryHash,
  saltFor,
  sessionCookie,
  startSession,
  verifier,
} from "./security";
const emailSchema = z.string().trim().toLowerCase().email().max(254);
const proofSchema = z.string().regex(/^[0-9a-f]{64}$/);
const credentialSchema = z.object({ email: emailSchema, proof: proofSchema });
export async function authParameters(env: Env, input: unknown) {
  const { email } = z.object({ email: emailSchema }).parse(input);
  const user = await env.DB.prepare(
    "SELECT password_salt FROM users WHERE email=?",
  )
    .bind(email)
    .first<{ password_salt: string }>();
  return {
    salt: user?.password_salt || (await saltFor(env, email)),
    iterations: ITERATIONS,
    version: 1,
  };
}
export async function authAction(
  name: string,
  args: unknown[],
  env: Env,
  user: UserRow | null,
  headers: Headers,
) {
  if (name === "registerAction") {
    const input = z
      .object({
        email: emailSchema,
        proof: proofSchema,
        displayName: z.string().trim().min(1).max(50),
        salt: z.string().regex(/^[a-f0-9]{32}$/),
      })
      .parse(args[0]);
    const salt = await saltFor(env, input.email);
    if (salt !== input.salt) throw new HttpError(400, "认证参数已改变，请重试");
    const id = crypto.randomUUID(),
      code = randomToken();
    const encoded = await verifier(
      env,
      { id, password_salt: salt },
      input.proof,
    );
    try {
      await env.DB.prepare(
        "INSERT INTO users(id,email,display_name,password_salt,password_verifier,recovery_hash) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          id,
          input.email,
          input.displayName,
          salt,
          encoded,
          await recoveryHash(id, code),
        )
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        throw new HttpError(
          409,
          "此登录邮箱不可用；已有账号请登录或使用恢复码找回",
        );
      throw error;
    }
    return {
      success: true,
      recoveryCode: code,
      message:
        "账号已创建。请保存恢复码，密码和恢复码同时丢失将无法找回。邮箱仅作登录标识，未经验证。",
    };
  }
  if (name === "loginAction") {
    const input = credentialSchema.parse(args[0]);
    await rateLimit(env, "login-email:" + input.email, 20, 3600000);
    const found = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(input.email)
      .first<UserRow>();
    const candidate =
      found ||
      ({
        id: "unknown",
        password_salt: await saltFor(env, input.email),
        password_verifier: null,
      } as UserRow);
    const valid = await checkProof(env, candidate, input.proof);
    if (!found || !valid) throw new HttpError(401, "邮箱或密码不正确");
    await startSession(env, found, headers);
    return { success: true };
  }
  if (name === "logoutAction") {
    // Expiring all sessions protects against copied/stale sessions on logout.
    if (user)
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=?")
        .bind(user.id)
        .run();
    headers.set("Set-Cookie", sessionCookie(env, "", 0));
    return { success: true };
  }
  if (name === "requestPasswordResetAction") {
    const input = credentialSchema
      .extend({ recoveryCode: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(args[0]);
    await rateLimit(env, "recovery-email:" + input.email, 10, 3600000);
    const found = await env.DB.prepare("SELECT * FROM users WHERE email=?")
      .bind(input.email)
      .first<UserRow>();
    if (!found) throw new HttpError(400, "邮箱或恢复码不正确");
    const code = randomToken();
    const changed = await env.DB.prepare(
      "UPDATE users SET password_verifier=?,recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND recovery_hash=? RETURNING id",
    )
      .bind(
        await verifier(env, found, input.proof),
        await recoveryHash(found.id, code),
        found.id,
        await recoveryHash(found.id, input.recoveryCode),
      )
      .first();
    if (!changed)
      throw new HttpError(400, "邮箱或恢复码不正确，旧恢复码只能使用一次");
    headers.set("Set-Cookie", sessionCookie(env, "", 0));
    return {
      success: true,
      recoveryCode: code,
      message: "密码已重置，所有旧会话已失效。请保存新的恢复码，旧码已作废。",
    };
  }
  if (name === "updatePasswordFromRecoveryAction") {
    const input = z
      .object({ token: z.string().regex(/^[0-9a-f]{64}$/), proof: proofSchema })
      .parse(args[0]);
    const hash = await digest(input.token);
    const found = await env.DB.prepare(
      "SELECT u.* FROM auth_invites i JOIN users u ON u.id=i.user_id WHERE i.token_hash=? AND i.expires_at>? AND u.password_verifier IS NULL",
    )
      .bind(hash, Date.now())
      .first<UserRow>();
    if (!found) throw new HttpError(400, "激活链接无效、已使用或已过期");
    const code = randomToken();
    const results = await env.DB.batch([
      env.DB.prepare(
        "UPDATE users SET password_verifier=?,recovery_hash=?,auth_version=auth_version+1 WHERE id=? AND password_verifier IS NULL AND EXISTS(SELECT 1 FROM auth_invites WHERE token_hash=? AND expires_at>?)",
      ).bind(
        await verifier(env, found, input.proof),
        await recoveryHash(found.id, code),
        found.id,
        hash,
        Date.now(),
      ),
      env.DB.prepare("DELETE FROM auth_invites WHERE token_hash=?").bind(hash),
    ]);
    if (results[0].meta.changes !== 1)
      throw new HttpError(409, "该激活链接已使用");
    return {
      success: true,
      recoveryCode: code,
      message: "账号已激活。请保存恢复码，然后登录。",
    };
  }
  if (name === "updateProfileAction") {
    if (!user) throw new HttpError(401, "请先登录");
    const input = z
      .object({ displayName: z.string().trim().min(1).max(50) })
      .parse(args[0]);
    await env.DB.prepare("UPDATE users SET display_name=? WHERE id=?")
      .bind(input.displayName, user.id)
      .run();
    return { success: true };
  }
  if (name === "updateAuthAction") {
    if (!user) throw new HttpError(401, "请先登录");
    const input = z
      .object({
        email: emailSchema.optional(),
        currentProof: proofSchema,
        proof: proofSchema.optional(),
      })
      .parse(args[0]);
    if (!(await checkProof(env, user, input.currentProof)))
      throw new HttpError(403, "当前密码不正确");
    const encoded = input.proof
      ? await verifier(env, user, input.proof)
      : user.password_verifier;
    const changed = await env.DB.prepare(
      "UPDATE users SET email=?,password_verifier=?,auth_version=auth_version+1 WHERE id=? AND auth_version=? RETURNING *",
    )
      .bind(input.email || user.email, encoded, user.id, user.auth_version)
      .first<UserRow>();
    if (!changed) throw new HttpError(409, "账号已发生变化，请重新登录");
    await startSession(env, changed, headers);
    return {
      success: true,
      message: "账号信息已更新，其他会话已失效。邮箱仅作登录标识，未经验证。",
    };
  }
  if (name === "getCurrentUser") return publicMe(user);
  return null;
}
