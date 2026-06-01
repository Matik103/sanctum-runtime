import { defineNitroConfig } from "nitro/config";

/** Vercel-only Nitro config (used by `vite.config.vercel.ts`). Cloudflare uses vite.config.ts. */
export default defineNitroConfig({
  preset: "vercel",
  compatibilityDate: "2025-05-15",
  routeRules: {
    "/assets/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
    "/robots.txt": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "text/plain; charset=utf-8",
      },
    },
    "/sitemap.xml": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "application/xml; charset=utf-8",
      },
    },
    "/sitemap-index.xml": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "application/xml; charset=utf-8",
      },
    },
    "/sitemap-ai.xml": {
      headers: {
        "cache-control": "public, max-age=0, must-revalidate",
        "content-type": "application/xml; charset=utf-8",
      },
    },
  },
});
