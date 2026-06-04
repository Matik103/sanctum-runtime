/**
 * Crawl-critical files served from the worker before SSR so Google/Bing always get
 * plain 200 responses even if the static asset layer is briefly unavailable during deploy.
 * Bodies are bundled at build time from public/ (keep in sync via npm run generate:sitemap).
 */
import robotsTxt from "../../public/robots.txt?raw";
import sitemapXml from "../../public/sitemap.xml?raw";
import sitemapIndexXml from "../../public/sitemap-index.xml?raw";
import sitemapAiXml from "../../public/sitemap-ai.xml?raw";
import llmsTxt from "../../public/llms.txt?raw";
import llmsFullTxt from "../../public/llms-full.txt?raw";
import aiArchitectureMd from "../../public/ai/architecture.md?raw";
import aiBlogIndexMd from "../../public/ai/blog-index.md?raw";
import aiGlossaryMd from "../../public/ai/glossary.md?raw";
import aiOverviewMd from "../../public/ai/overview.md?raw";
import aiSdkMd from "../../public/ai/sdk.md?raw";
import aiSecurityMd from "../../public/ai/security.md?raw";

export const crawlStaticPaths = [
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-index.xml",
  "/sitemap-ai.xml",
  "/llms.txt",
  "/llms-full.txt",
  "/ai/architecture.md",
  "/ai/blog-index.md",
  "/ai/glossary.md",
  "/ai/overview.md",
  "/ai/sdk.md",
  "/ai/security.md",
] as const;

export type CrawlStaticPath = (typeof crawlStaticPaths)[number];

const crawlBodies: Record<CrawlStaticPath, string> = {
  "/robots.txt": robotsTxt,
  "/sitemap.xml": sitemapXml,
  "/sitemap-index.xml": sitemapIndexXml,
  "/sitemap-ai.xml": sitemapAiXml,
  "/llms.txt": llmsTxt,
  "/llms-full.txt": llmsFullTxt,
  "/ai/architecture.md": aiArchitectureMd,
  "/ai/blog-index.md": aiBlogIndexMd,
  "/ai/glossary.md": aiGlossaryMd,
  "/ai/overview.md": aiOverviewMd,
  "/ai/sdk.md": aiSdkMd,
  "/ai/security.md": aiSecurityMd,
};

const crawlContentTypes: Record<CrawlStaticPath, string> = {
  "/robots.txt": "text/plain; charset=utf-8",
  "/sitemap.xml": "application/xml; charset=utf-8",
  "/sitemap-index.xml": "application/xml; charset=utf-8",
  "/sitemap-ai.xml": "application/xml; charset=utf-8",
  "/llms.txt": "text/plain; charset=utf-8",
  "/llms-full.txt": "text/plain; charset=utf-8",
  "/ai/architecture.md": "text/markdown; charset=utf-8",
  "/ai/blog-index.md": "text/markdown; charset=utf-8",
  "/ai/glossary.md": "text/markdown; charset=utf-8",
  "/ai/overview.md": "text/markdown; charset=utf-8",
  "/ai/sdk.md": "text/markdown; charset=utf-8",
  "/ai/security.md": "text/markdown; charset=utf-8",
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
