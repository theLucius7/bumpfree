import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Optional local credentials; CI can supply the same variables directly.
// Never copy them to NEXT_PUBLIC_* or into the static export.
if (existsSync(".env.cloudflare")) process.loadEnvFile(".env.cloudflare");
const result = spawnSync(
  process.execPath,
  ["node_modules/wrangler/bin/wrangler.js", ...process.argv.slice(2)],
  { stdio: "inherit", env: process.env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
