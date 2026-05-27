/**
 * Regenerate public/sitemap*.xml from src/lib/seo.ts (run before marketing build).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRepoEnv } from "./env.ts";
import { BLOG_POSTS } from "../src/lib/blog-posts.ts";
import {
  absoluteUrl,
  sitemapAiPaths,
  sitemapPages,
} from "../src/lib/seo.ts";
import { generateAiDiscovery } from "./generate-ai-discovery.ts";

loadRepoEnv();
generateAiDiscovery();

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
  const blogUrls = BLOG_POSTS.map((p) =>
    urlEntry(absoluteUrl(`/blog/${p.slug}`), "monthly", 0.75),
  );
  const urls = [
    ...sitemapPages.map((p) =>
      urlEntry(absoluteUrl(p.path), p.changefreq, p.priority),
    ),
    ...blogUrls,
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
  writeFileSync(resolve(publicDir, "sitemap.xml"), xml, "utf8");
}

function writeAiSitemap() {
  const staticAi = sitemapAiPaths.map((path) =>
    urlEntry(absoluteUrl(path), "monthly", path === "/llms.txt" ? 0.85 : 0.7),
  );
  const blogAi = BLOG_POSTS.map((p) =>
    urlEntry(absoluteUrl(`/blog/${p.slug}`), "monthly", 0.72),
  );
  const urls = [...staticAi, ...blogAi];
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
const aiUrlCount = sitemapAiPaths.length + BLOG_POSTS.length;
console.log(
  `Sitemaps written (${lastmod}): sitemap.xml, sitemap-ai.xml (${aiUrlCount} URLs), sitemap-index.xml`,
);
