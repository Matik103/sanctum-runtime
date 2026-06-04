#!/usr/bin/env node
/**
 * Post-deploy crawl checks for Google Search Console / Bing.
 * Usage: CRAWL_BASE=https://www.sanctumruntime.com node scripts/verify-crawl.mjs
 */
const BASE = (process.env.CRAWL_BASE || "https://www.sanctumruntime.com").replace(/\/$/, "");
const APEX = process.env.CRAWL_APEX || "https://sanctumruntime.com";

const crawlFiles = [
  {
    path: "/robots.txt",
    contentType: "text/plain",
    includes: ["User-agent:", "Sitemap:", "llms-full.txt"],
  },
  {
    path: "/llms.txt",
    contentType: "text/plain",
    includes: ["Sanctum Runtime", "llms-full.txt", "/ai/blog-index.md"],
  },
  {
    path: "/llms-full.txt",
    contentType: "text/plain",
    includes: ["full AI crawler index", "What is a runtime trust layer", "Crawl assets"],
  },
  {
    path: "/sitemap-index.xml",
    contentType: "application/xml",
    includes: ["/sitemap.xml", "/sitemap-ai.xml"],
  },
  {
    path: "/sitemap.xml",
    contentType: "application/xml",
    includes: ["/privacy", "/blog/runtime-trust-layer-for-ai-agents"],
  },
  {
    path: "/sitemap-ai.xml",
    contentType: "application/xml",
    includes: ["/llms.txt", "/llms-full.txt", "/ai/blog-index.md"],
  },
  {
    path: "/ai/blog-index.md",
    contentType: "text/markdown",
    includes: ["Machine-readable catalog", "runtime-trust-layer-for-ai-agents"],
  },
  {
    path: "/ai/overview.md",
    contentType: "text/markdown",
    includes: ["Sanctum Runtime", "real-world execution", "Action verification"],
  },
  {
    path: "/ai/architecture.md",
    contentType: "text/markdown",
    includes: ["Architecture", "Policy engine", "POST /v1/actions/verify"],
  },
  {
    path: "/ai/sdk.md",
    contentType: "text/markdown",
    includes: ["SDK", "protectAgent", "SANCTUM_API_KEY"],
  },
  {
    path: "/ai/security.md",
    contentType: "text/markdown",
    includes: ["Security", "untrusted proposers", "Policy fail-closed"],
  },
  {
    path: "/ai/glossary.md",
    contentType: "text/markdown",
    includes: ["Glossary", "Action verification", "Control plane"],
  },
];

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

async function check(label, url, opts = {}) {
  const res = await fetch(url, {
    redirect: opts.followRedirects === false ? "manual" : "follow",
    headers: { "user-agent": opts.ua || "Sanctum-Crawl-Verify/1.0" },
  });
  const text = opts.readBody ? await res.text() : "";
  return { label, url, res, text };
}

async function main() {
  for (const file of crawlFiles) {
    const result = await check(file.path, `${BASE}${file.path}`, { readBody: true });
    if (!result.res.ok) fail(`${file.path} ${result.res.status}`);
    const ct = result.res.headers.get("content-type") || "";
    if (!ct.includes(file.contentType)) fail(`${file.path} content-type: ${ct}`);
    for (const expected of file.includes) {
      if (!result.text.includes(expected)) fail(`${file.path} missing ${expected}`);
    }
    ok(`${file.path} 200 ${file.contentType}`);
  }

  const robotsGoogle = await check("robots Googlebot", `${BASE}/robots.txt`, {
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    readBody: true,
  });
  if (!robotsGoogle.res.ok) fail(`Googlebot robots ${robotsGoogle.res.status}`);
  ok("Googlebot robots.txt");

  const apex = await check("apex robots direct", `${APEX}/robots.txt`, {
    readBody: true,
  });
  if (!apex.res.ok) fail(`apex robots ${apex.res.status} (must be 200 for GSC domain property)`);
  if (!apex.text.includes("User-agent:")) fail("apex robots.txt missing User-agent");
  ok("apex robots.txt 200 (no redirect required)");

  const favicon = await check("favicon", `${BASE}/favicon.ico`, { followRedirects: false });
  if (![200, 301, 302, 307, 308].includes(favicon.res.status)) {
    fail(`favicon.ico ${favicon.res.status}`);
  }
  ok("favicon.ico resolves or redirects");

  const privacy = await check("privacy", `${BASE}/privacy`);
  if (!privacy.res.ok) fail(`privacy ${privacy.res.status}`);
  ok("/privacy 200");

  console.log("\nAll crawl checks passed.");
}

main().catch((e) => fail(e.message));
