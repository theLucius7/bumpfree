import { existsSync, readFileSync } from "node:fs";
import { parse } from "jsonc-parser";

if (existsSync(".env.cloudflare")) process.loadEnvFile(".env.cloudflare");
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/.test(account || "") || !token)
  throw new Error(
    "Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in ignored .env.cloudflare",
  );
const errors = [];
export const config = parse(
  readFileSync("worker/wrangler.jsonc", "utf8"),
  errors,
  { allowTrailingComma: true },
);
if (errors.length)
  throw new Error("worker/wrangler.jsonc contains invalid JSONC");
const database = config.d1_databases.find(
  (d) => d.binding === "DB",
).database_id;
export async function cloudflare(path, body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!result.success)
    throw new Error(
      `Cloudflare ${response.status}: ${result.errors?.map((e) => e.message).join("; ")}`,
    );
  return result.result;
}
export const query = (sql, params = []) =>
  cloudflare(`d1/database/${database}/query`, { sql, params });
