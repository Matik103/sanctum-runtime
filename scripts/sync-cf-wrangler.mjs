#!/usr/bin/env node
/**
 * Cloudflare Workers Builds often runs `npx wrangler deploy` (no --config).
 * Nitro emits the real Workers config at dist/server/wrangler.json; copy it to
 * ./wrangler.json so bare wrangler deploy picks it up.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
writeFileSync(src, `${JSON.stringify(config, null, 2)}\n`);
copyFileSync(src, dest);
console.log(`[sync-cf-wrangler] Wrote ${dest} (name=${WORKER_NAME}) from ${src}`);
