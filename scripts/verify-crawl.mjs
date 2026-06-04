#!/usr/bin/env node
/**
 * Post-deploy crawl checks for Google Search Console / Bing.
 * Usage: CRAWL_BASE=https://www.sanctumruntime.com node scripts/verify-crawl.mjs
 */
const BASE = (process.env.CRAWL_BASE || "https://www.sanctumruntime.com").replace(/\/$/, "");
const APEX = process.env.CRAWL_APEX || "https://sanctumruntime.com";

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
  const robotsWww = await check("robots www", `${BASE}/robots.txt`, { readBody: true });
  if (!robotsWww.res.ok) fail(`robots.txt ${robotsWww.res.status}`);
  const ct = robotsWww.res.headers.get("content-type") || "";
  if (!ct.includes("text/plain")) fail(`robots content-type: ${ct}`);
  if (!robotsWww.text.includes("User-agent:")) fail("robots.txt missing User-agent");
  if (!robotsWww.text.includes("Sitemap:")) fail("robots.txt missing Sitemap");
  ok("www robots.txt 200 text/plain");

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

  const llms = await check("llms", `${BASE}/llms.txt`, { readBody: true });
  if (!llms.res.ok) fail(`llms.txt ${llms.res.status}`);
  if (!(llms.res.headers.get("content-type") || "").includes("text/plain")) {
    fail(`llms.txt content-type: ${llms.res.headers.get("content-type") || ""}`);
  }
  if (!llms.text.includes("Sanctum Runtime")) fail("llms.txt missing Sanctum Runtime");
  ok("llms.txt 200 text/plain");

  const llmsFull = await check("llms full", `${BASE}/llms-full.txt`, { readBody: true });
  if (!llmsFull.res.ok) fail(`llms-full.txt ${llmsFull.res.status}`);
  if (!(llmsFull.res.headers.get("content-type") || "").includes("text/plain")) {
    fail(`llms-full.txt content-type: ${llmsFull.res.headers.get("content-type") || ""}`);
  }
  if (!llmsFull.text.includes("full AI crawler index")) fail("llms-full.txt missing crawler index heading");
  ok("llms-full.txt 200 text/plain");

  const favicon = await check("favicon", `${BASE}/favicon.ico`, { followRedirects: false });
  if (![200, 301, 302, 307, 308].includes(favicon.res.status)) {
    fail(`favicon.ico ${favicon.res.status}`);
  }
  ok("favicon.ico resolves or redirects");

  const privacy = await check("privacy", `${BASE}/privacy`);
  if (!privacy.res.ok) fail(`privacy ${privacy.res.status}`);
  ok("/privacy 200");

  const sitemap = await check("sitemap", `${BASE}/sitemap.xml`, { readBody: true });
  if (!sitemap.res.ok) fail(`sitemap ${sitemap.res.status}`);
  if (!sitemap.text.includes(`${BASE}/privacy`)) fail("sitemap missing /privacy");
  ok("sitemap.xml includes /privacy");

  console.log("\nAll crawl checks passed.");
}

main().catch((e) => fail(e.message));
