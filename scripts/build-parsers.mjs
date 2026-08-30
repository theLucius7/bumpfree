import { build } from "esbuild";
await build({
  entryPoints: ["lib/utils/ics.worker.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "public/ics-worker.js",
  minify: true,
  legalComments: "none",
});
