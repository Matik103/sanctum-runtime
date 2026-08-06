import { defineNitroConfig } from "nitro/config";

/**
 * Shared Nitro route rules only — do not pin `preset` here.
 * Cloudflare: vite.config.ts (`nitro.preset: cloudflare-module`)
 * Vercel: vite.config.vercel.ts (`nitro({ preset: "vercel" })`)
 */
export default defineNitroConfig({
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
