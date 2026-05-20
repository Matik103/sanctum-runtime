import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function apiProxyTarget(env: Record<string, string>): string {
  if (env.SANCTUM_API_URL) return env.SANCTUM_API_URL.replace(/\/$/, '')
  if (env.HOST && env.PORT) return `http://${env.HOST}:${env.PORT}`
  throw new Error('Set SANCTUM_API_URL or HOST+PORT in repo .env (see .env.example)')
}

function dashboardServer(env: Record<string, string>): { host: string; port: number } {
  if (env.DASHBOARD_HOST && env.DASHBOARD_PORT) {
    return { host: env.DASHBOARD_HOST, port: Number(env.DASHBOARD_PORT) }
  }
  if (env.DASHBOARD_URL) {
    const u = new URL(env.DASHBOARD_URL)
    const port = u.port
      ? Number(u.port)
      : u.protocol === 'https:'
        ? 443
        : 80
    return { host: u.hostname, port }
  }
  throw new Error('Set DASHBOARD_URL or DASHBOARD_HOST+DASHBOARD_PORT in repo .env')
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, repoRoot, '')
  const isServe = command === 'serve'

  const config: import('vite').UserConfig = {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'favicon-512.png'],
        manifest: {
          name: 'Sanctum Runtime Console',
          short_name: 'Sanctum',
          description: 'Mobile control center for AI runtime trust — approvals, monitoring, and policy management.',
          theme_color: '#070b14',
          background_color: '#070b14',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          categories: ['productivity', 'security'],
          icons: [
            { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
            { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            {
              name: 'Pending Verifications',
              short_name: 'Verify',
              description: 'Review pending action verifications',
              url: '/?page=activity',
              icons: [{ src: '/favicon-512.png', sizes: '512x512' }],
            },
            {
              name: 'Runtime Activity',
              short_name: 'Activity',
              description: 'Live runtime action feed',
              url: '/?page=activity',
              icons: [{ src: '/favicon-512.png', sizes: '512x512' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    envDir: repoRoot,
    envPrefix: ['VITE_'],
    build: {
      sourcemap: false,
    },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '',
      ),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(
        env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '',
      ),
      'import.meta.env.VITE_SANCTUM_API_URL': JSON.stringify(
        env.VITE_SANCTUM_API_URL ?? env.SANCTUM_API_URL ?? '',
      ),
    },
  }

  if (isServe) {
    const { host, port } = dashboardServer(env)
    config.server = {
      host,
      port,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiProxyTarget(env),
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          configure: (proxy) => {
            const key = env.SANCTUM_API_KEY?.trim()
            if (!key) return
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.headers.authorization) return
              proxyReq.setHeader('X-Sanctum-Key', key)
            })
          },
        },
      },
    }
  }

  return config
})
