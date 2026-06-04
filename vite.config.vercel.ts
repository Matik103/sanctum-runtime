/**
 * Vercel production build — TanStack Start + Nitro (no Cloudflare plugin).
 * Cloudflare deploys use vite.config.ts (`npm run build` / `npm run deploy`).
 */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

export default defineConfig({
  cloudflare: false,
  plugins: [
    nitro({
      preset: "vercel",
      vercel: {
        functions: {
          runtime: "nodejs22.x",
        },
      },
    }),
  ],
  tanstackStart: {
    server: { entry: "server" },
  },
});
