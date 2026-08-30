import { createHash, randomBytes, randomUUID } from "node:crypto";
import { config, query } from "./cloudflare-api.mjs";

const [mode, target, displayName = "Site owner"] = process.argv.slice(2);
if (mode === "promote") {
  if (!/^[a-f0-9-]{36}$/.test(target || ""))
    throw new Error("Usage: npm run admin -- promote <existing-user-uuid>");
  const result = await query(
    "UPDATE users SET role='superadmin' WHERE id=? AND password_verifier IS NOT NULL RETURNING id,email,role",
    [target],
  );
  if (!result[0].results.length)
    throw new Error("Active user not found; nothing changed");
  console.log(JSON.stringify(result[0].results[0]));
} else if (mode === "invite") {
  const email = (target || "").trim().toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !displayName ||
    displayName.length > 50
  )
    throw new Error(
      'Usage: npm run admin -- invite owner@example.com "Owner name"',
    );
  const existing = (
    await query(
      "SELECT id,password_verifier,password_salt FROM users WHERE email=?",
      [email],
    )
  )[0].results[0];
  if (existing?.password_verifier)
    throw new Error(
      "This email is already active. Verify its owner and explicitly promote the exact user UUID instead.",
    );
  const response = await fetch(config.vars.SITE_URL + "/api/auth/parameters", {
    method: "POST",
    headers: {
      Origin: config.vars.SITE_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  if (!response.ok)
    throw new Error(
      "The deployed authentication API must be healthy before creating an invitation",
    );
  const { salt } = await response.json();
  if (!/^[a-f0-9]{32}$/.test(salt || ""))
    throw new Error("Invalid authentication parameters");
  const id = existing?.id || randomUUID(),
    activation = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(activation).digest("hex");
  // A failed issuance leaves only an inactive reserved account; safely rerun to
  // issue a new link. Never replace an active account or its credentials.
  const reserved = await query(
    "INSERT INTO users(id,email,display_name,password_salt,role) VALUES(?,?,?,?,'superadmin') ON CONFLICT(email) DO UPDATE SET role='superadmin' WHERE password_verifier IS NULL AND id=excluded.id RETURNING id",
    [id, email, displayName, salt],
  );
  if (!reserved[0].results.length)
    throw new Error("Account state changed; no invitation issued");
  const result = await query(
    "INSERT INTO auth_invites(token_hash,user_id,expires_at) SELECT ?,id,? FROM users WHERE id=? AND password_verifier IS NULL AND role='superadmin' ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at RETURNING user_id",
    [hash, Date.now() + 7 * 86400000, id],
  );
  if (!result.at(-1).results.length)
    throw new Error("Account state changed; no invitation issued");
  console.log(
    config.vars.SITE_URL + "/auth/update-password/#token=" + activation,
  );
  console.log(
    "Single-use administrator activation link, valid for 7 days. Share privately; it grants admin access. No email was sent.",
  );
} else
  throw new Error(
    "Usage: npm run admin -- invite <email> [displayName] | promote <user-uuid>",
  );
