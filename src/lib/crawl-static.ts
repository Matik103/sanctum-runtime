/**
 * Crawl-critical files served from the worker before SSR so Google/Bing always get
 * plain 200 responses even if the static asset layer is briefly unavailable during deploy.
 * Bodies are bundled at build time from public/ (keep in sync via npm run generate:sitemap).
 */
import robotsTxt from "../../public/robots.txt?raw";
import sitemapXml from "../../public/sitemap.xml?raw";
import sitemapIndexXml from "../../public/sitemap-index.xml?raw";
import sitemapAiXml from "../../public/sitemap-ai.xml?raw";

export const crawlStaticPaths = [
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/sitemap-ai.xml",
] as const;

export type CrawlStaticPath = (typeof crawlStaticPaths)[number];

const crawlBodies: Record<CrawlStaticPath, string> = {
  "/robots.txt": robotsTxt,
  "/sitemap.xml": sitemapXml,
  "/sitemap-index.xml": sitemapIndexXml,
  "/sitemap-ai.xml": sitemapAiXml,
};

const crawlContentTypes: Record<CrawlStaticPath, string> = {
  "/robots.txt": "text/plain; charset=utf-8",
  "/sitemap.xml": "application/xml; charset=utf-8",
  "/sitemap-index.xml": "application/xml; charset=utf-8",
  "/sitemap-ai.xml": "application/xml; charset=utf-8",
};

export function isCrawlStaticPath(pathname: string): pathname is CrawlStaticPath {
  return (crawlStaticPaths as readonly string[]).includes(pathname);
}

export function crawlStaticResponse(pathname: CrawlStaticPath): Response {
  return new Response(crawlBodies[pathname], {
    status: 200,
    headers: {
      "content-type": crawlContentTypes[pathname],
      "cache-control": "public, max-age=0, must-revalidate",
      "x-robots-tag": "all",
    },
  });
}
