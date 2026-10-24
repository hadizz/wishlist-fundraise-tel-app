#!/usr/bin/env node
/**
 * Proves the build-time backend-exclusion gate in vite.config.ts rejects
 * server code. Each case is built with `vite build --config` against a
 * temporary config that keeps the project plugins and marks one probe module as
 * the entry. A blocking gate must fail on every probe; the baseline build must
 * still pass.
 * Run from client/ after `npm ci`: `node scripts/check-boundary.mjs`.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const client = resolve(import.meta.dirname, "..");
const vite = join(client, "node_modules", ".bin", "vite");
const outDir = mkdtempSync(join(tmpdir(), "boundary-"));

const probes = [
  ["root env module", `import { env } from "../../src/env"; console.log(env.BOT_TOKEN);`],
  ["root lib module", `import { PLAN_LIMITS } from "../../src/lib/entitlements"; console.log(PLAN_LIMITS);`],
  ["root services module", `import { respondToFollow } from "../../src/services/follows"; console.log(respondToFollow);`],
  ["drizzle-orm package", `import { eq } from "drizzle-orm"; console.log(eq);`],
  ["ioredis package", `import Redis from "ioredis"; console.log(Redis);`],
  ["grammy package", `import { Bot } from "grammy"; console.log(Bot);`],
  ["@grammyjs package", `import { autoRetry } from "@grammyjs/auto-retry"; console.log(autoRetry);`],
  ["@aws-sdk package", `import { S3Client } from "@aws-sdk/client-s3"; console.log(S3Client);`],
];

function build(entry) {
  const dir = mkdtempSync(join(client, "src", ".boundary-"));
  const file = join(dir, "entry.ts");
  writeFileSync(file, entry, "utf8");
  const config = join(dir, "vite.config.mjs");
  writeFileSync(
    config,
    `// Reuse the project config so the real boundary plugin is under test.
const { default: project } = await import(${JSON.stringify(join(client, "vite.config.ts"))});
export default {
  ...project,
  root: ${JSON.stringify(client)},
  cacheDir: ${JSON.stringify(join(dir, "cache"))},
  build: { outDir: ${JSON.stringify(outDir)}, emptyOutDir: true, lib: { entry: ${JSON.stringify(file)}, formats: ["es"], fileName: "probe" } },
};
`,
    "utf8",
  );
  const result = spawnSync(vite, ["build", "--config", config], { cwd: client, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

let failures = 0;
for (const [name, source] of probes) {
  const result = build(source);
  const blocked = result.status !== 0;
  if (!blocked) failures += 1;
  const reason = (result.stderr + result.stdout)
    .match(/Server (?:module|package)[^\n]*/)?.[0]
    .replace(/ imported by .*$/, "") ?? "";
  console.log(`${blocked ? "blocked" : "LEAKED "} ${name}${reason ? ` — ${reason}` : ""}`);
}

process.exit(failures === 0 ? 0 : 1);
