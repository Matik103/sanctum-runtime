// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.SITE_HOST;
  const port = env.SITE_PORT ? Number(env.SITE_PORT) : undefined;
  if (!host || !port) {
    throw new Error("Set SITE_HOST and SITE_PORT in .env (see .env.example)");
  }

  return {
    tanstackStart: {
      server: { entry: "server" },
    },
    vite: {
      server: {
        host,
        port,
        strictPort: false,
      },
    },
  };
});
