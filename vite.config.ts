// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// nitro: true generates dist/server/wrangler.json for `npx wrangler deploy`.
const devEnv = loadEnv("development", process.cwd(), "");
const configuredPort = Number(devEnv.SITE_PORT || 8080);

export default defineConfig({
  // Required for Cloudflare deploy: generates dist/server/wrangler.json (see npm run deploy).
  nitro: true,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: devEnv.SITE_HOST || "127.0.0.1",
      port: Number.isFinite(configuredPort) ? configuredPort : 8080,
      strictPort: false,
    },
  },
});
