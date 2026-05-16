import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const { host, port } = dashboardServer(env)

  return {
    plugins: [react()],
    server: {
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
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('X-Sanctum-Key', key)
            })
          },
        },
      },
    },
  }
})
