import type { Env, UserRow } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const encoder = new TextEncoder();
export const ITERATIONS = 600_000;
export const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
export const digest = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
function unhex(value: string) {
  return new Uint8Array(value.match(/../g)!.map((b) => parseInt(b, 16)));
}
async function hmacKey(env: Env) {
  if (!/^[0-9a-f]{64}$/i.test(env.AUTH_PEPPER || ""))
    throw new HttpError(503, "认证服务未配置");
  return crypto.subtle.importKey(
    "raw",
    unhex(env.AUTH_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function saltFor(env: Env, email: string) {
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(env),
      encoder.encode(JSON.stringify(["bumpfree-salt-v1", email])),
    ),
  ).slice(0, 32);
}
function verifierMessage(
  user: Pick<UserRow, "id" | "password_salt">,
  proof: string,
) {
  if (!/^[0-9a-f]{64}$/.test(proof || ""))
    throw new HttpError(400, "凭证格式不正确，请刷新后重试");
  return encoder.encode(
    JSON.stringify([
      "bumpfree-verifier-v1",
      "PBKDF2-SHA256",
      ITERATIONS,
      user.id,
      user.password_salt,
      proof,
    ]),
  );
}
export async function verifier(
  env: Env,
  user: Pick<UserRow, "id" | "password_salt">,
  proof: string,
) {
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(env),
      verifierMessage(user, proof),
    ),
  );
}
export async function checkProof(env: Env, user: UserRow, proof: string) {
  const message = verifierMessage(user, proof);
  const expected = user.password_verifier || "0".repeat(64);
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(env),
    unhex(expected),
    message,
  );
}
export const recoveryHash = (id: string, code: string) =>
  digest(JSON.stringify(["bumpfree-recovery-v1", id, code]));
export function publicMe(user: UserRow | null) {
  if (!user) return { user: null, profile: null };
  const {
    id,
    email,
    display_name,
    role,
    room_quota,
    schedule_quota,
    created_at,
  } = user;
  return {
    user: { id, email },
    profile: { id, display_name, role, room_quota, schedule_quota, created_at },
  };
}
export function cookieName(env: Env) {
  return env.DEV_ORIGIN ? "bumpfree-dev" : "__Host-bumpfree";
}
export function sessionCookie(env: Env, token: string, maxAge = 604800) {
  return (
    cookieName(env) +
    "=" +
    token +
    "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" +
    maxAge +
    (env.DEV_ORIGIN ? "" : "; Secure")
  );
}
export async function currentUser(request: Request, env: Env) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(cookieName(env) + "="))
    ?.split("=")[1];
  if (!value || !/^[0-9a-f]{64}$/.test(value)) return null;
  return env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.auth_version=u.auth_version",
  )
    .bind(await digest(value), Date.now())
    .first<UserRow>();
}
export async function startSession(env: Env, user: UserRow, headers: Headers) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM sessions WHERE user_id=? AND (expires_at<=? OR auth_version!=?)",
    ).bind(user.id, now, user.auth_version),
    env.DB.prepare(
      "INSERT INTO sessions(token_hash,user_id,auth_version,expires_at,created_at) VALUES(?,?,?,?,?)",
    ).bind(
      await digest(token),
      user.id,
      user.auth_version,
      now + 604800000,
      now,
    ),
    env.DB.prepare(
      "DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 10)",
    ).bind(user.id, user.id),
  ]);
  headers.set("Set-Cookie", sessionCookie(env, token));
}
export function trustedMutation(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (origin !== env.SITE_URL && (!env.DEV_ORIGIN || origin !== env.DEV_ORIGIN))
    throw new HttpError(403, "请求来源不合法");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "不接受跨站请求");
}
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  duration: number,
) {
  const now = Date.now();
  const bucket = Math.floor(now / duration);
  const hashed = await digest(key + ":" + bucket);
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(hashed, (bucket + 1) * duration)
    .first<{ count: number }>();
  if (!row || row.count > limit)
    throw new HttpError(429, "请求过于频繁，请稍后再试");
}
export async function readBody(request: Request, max: number) {
  const length = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(length) || length > max)
    throw new HttpError(413, "请求过大");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "请求过大");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
