import { defineNitroConfig } from "nitro/config";

/** Vercel-only Nitro config (used by `vite.config.vercel.ts`). Cloudflare uses vite.config.ts. */
export default defineNitroConfig({
  preset: "vercel",
  compatibilityDate: "2025-05-15",
  routeRules: {
    "/assets/**": {
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  },
});
