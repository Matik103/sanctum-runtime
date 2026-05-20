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
        includeAssets: ['favicon.png', 'favicon-512.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Sanctum Runtime Companion',
          short_name: 'Sanctum',
          description:
            'Mobile trust control for autonomous AI — verifications, runtime monitoring, and approvals.',
          theme_color: '#0b1120',
          background_color: '#070b14',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          categories: ['security', 'productivity', 'utilities'],
          icons: [
            {
              src: 'favicon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'favicon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: 'apple-touch-icon.png',
              sizes: '180x180',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
          importScripts: ['/push-handler.js'],
        },
        devOptions: {
          enabled: false,
        },
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
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(
        env.VITE_VAPID_PUBLIC_KEY ?? '',
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
