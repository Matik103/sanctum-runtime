#!/usr/bin/env node
/**
 * Cloudflare Workers Builds often runs `npx wrangler deploy` (no --config).
 * Nitro emits the real Workers config at dist/server/wrangler.json (paths relative
 * to that directory). We pin the worker name there for `cf:deploy`, and write a
 * repo-root wrangler.json with paths rebased for bare `wrangler deploy` from root.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKER_NAME = "sanctum-runtime";
const src = resolve("dist/server/wrangler.json");
const dest = resolve("wrangler.json");

if (!existsSync(src)) {
  console.error(`[sync-cf-wrangler] Missing ${src}. Did the Cloudflare Nitro build succeed?`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(src, "utf8"));
config.name = WORKER_NAME;

/** Paths in dist/server/wrangler.json are relative to dist/server/. */
writeFileSync(src, `${JSON.stringify(config, null, 2)}\n`);

/** Rebase path-valued fields so the repo-root wrangler.json works from cwd /. */
const rootConfig = structuredClone(config);
rootConfig.main = rebaseToRepoRoot(rootConfig.main, "dist/server");
if (rootConfig.assets && typeof rootConfig.assets === "object" && rootConfig.assets.directory) {
  rootConfig.assets.directory = rebaseToRepoRoot(rootConfig.assets.directory, "dist/server");
}

writeFileSync(dest, `${JSON.stringify(rootConfig, null, 2)}\n`);
console.log(
  `[sync-cf-wrangler] Wrote ${dest} (name=${WORKER_NAME}, main=${rootConfig.main}, assets=${rootConfig.assets?.directory ?? "n/a"})`,
);

/**
 * @param {unknown} value
 * @param {string} fromDir directory the path is currently relative to (no trailing slash)
 */
function rebaseToRepoRoot(value, fromDir) {
  if (typeof value !== "string" || !value) return value;
  // Already repo-root relative
  if (value.startsWith("dist/")) return value;
  // Resolve relative segments against fromDir without touching the filesystem
  const joined = `${fromDir}/${value}`.split("/");
  const out = [];
  for (const part of joined) {
    if (!part || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}
