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

  const apex = await check("apex robots redirect", `${APEX}/robots.txt`, {
    followRedirects: false,
    readBody: true,
  });
  if (apex.res.status !== 308 && apex.res.status !== 301) {
    fail(`apex robots expected 308, got ${apex.res.status}`);
  }
  const loc = apex.res.headers.get("location") || "";
  if (!loc.includes("www.sanctumruntime.com/robots.txt")) {
    fail(`apex robots location: ${loc || "(missing)"}`);
  }
  ok("apex robots.txt → www");

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
