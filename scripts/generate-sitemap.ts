/**
 * Regenerate public/sitemap*.xml from src/lib/seo.ts (run before marketing build).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRepoEnv } from "./env.ts";
import {
  absoluteUrl,
  sitemapAiPaths,
  sitemapPages,
} from "../src/lib/seo.ts";

loadRepoEnv();

const lastmod = new Date().toISOString().slice(0, 10);
const publicDir = resolve(import.meta.dirname, "../public");

function urlEntry(loc: string, changefreq: string, priority: number): string {
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(2)}</priority>
  </url>`;
}

function writePagesSitemap() {
  const urls = sitemapPages.map((p) =>
    urlEntry(absoluteUrl(p.path), p.changefreq, p.priority),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  writeFileSync(resolve(publicDir, "sitemap.xml"), xml, "utf8");
}

function writeAiSitemap() {
  const urls = sitemapAiPaths.map((path) =>
    urlEntry(absoluteUrl(path), "monthly", path === "/llms.txt" ? 0.7 : 0.65),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  writeFileSync(resolve(publicDir, "sitemap-ai.xml"), xml, "utf8");
}

function writeSitemapIndex() {
  const pagesLoc = absoluteUrl("/sitemap.xml");
  const aiLoc = absoluteUrl("/sitemap-ai.xml");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${pagesLoc}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${aiLoc}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>
</sitemapindex>
`;
  writeFileSync(resolve(publicDir, "sitemap-index.xml"), xml, "utf8");
}

writePagesSitemap();
writeAiSitemap();
writeSitemapIndex();
console.log(`Sitemaps written (${lastmod}): sitemap.xml, sitemap-ai.xml, sitemap-index.xml`);
