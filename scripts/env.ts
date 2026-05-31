/**
 * Load repo-root `.env` and resolve endpoints (no hardcoded hosts/ports in app code).
 */
import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { applyViteSupabaseAliases } from './supabase-env.ts'

function repoRootFromCwd(): string {
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, 'package.json')) && existsSync(resolve(dir, '.env.example'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

let loaded = false

export function loadRepoEnv(): void {
  if (loaded) return
  const root = repoRootFromCwd()
  const envPath = resolve(root, '.env')
  if (existsSync(envPath)) {
    config({ path: envPath })
  }
  const e2ePath = resolve(root, '.env.e2e.local')
  if (existsSync(e2ePath)) {
    config({ path: e2ePath, override: true })
  }
  applyViteSupabaseAliases()
  // Cloud hosts (Render, etc.) inject env vars — no .env file required.
  loaded = true
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, '')
}

export function resolveSanctumApiUrl(): string {
  loadRepoEnv()
  if (process.env.SANCTUM_API_URL) return stripSlash(process.env.SANCTUM_API_URL)
  const { HOST, PORT } = process.env
  if (HOST && PORT) return `http://${HOST}:${PORT}`
  throw new Error('Set SANCTUM_API_URL or both HOST and PORT in .env')
}

/** Headers for scripts calling the runtime API (respects SANCTUM_API_KEY when set). */
export function apiRequestHeaders(json = true): Record<string, string> {
  loadRepoEnv()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  const apiUrl = resolveSanctumApiUrl()
  const isLocalHost =
    /127\.0\.0\.1|localhost/.test(apiUrl) ||
    apiUrl.startsWith(`http://${process.env.HOST || '127.0.0.1'}`)
  // Local dev: legacy SANCTUM_API_KEY (pepper hash) matches the API process env.
  // Production: dashboard sk_sanctum_* from e2e bootstrap.
  const key = isLocalHost
    ? process.env.SANCTUM_API_KEY?.trim() || process.env.SANCTUM_E2E_API_KEY?.trim()
    : process.env.SANCTUM_E2E_API_KEY?.trim() || process.env.SANCTUM_API_KEY?.trim()
  if (key) h['X-Sanctum-Key'] = key
  return h
}

export function resolveApiListenTarget(): { host: string; port: number } {
  loadRepoEnv()
  if (process.env.SANCTUM_API_URL) {
    const u = new URL(process.env.SANCTUM_API_URL)
    const port = u.port
      ? Number(u.port)
      : u.protocol === 'https:'
        ? 443
        : 80
    return { host: u.hostname, port }
  }
  const port = process.env.PORT
  if (port) {
    return { host: process.env.HOST?.trim() || '0.0.0.0', port: Number(port) }
  }
  const { HOST, PORT } = process.env
  if (HOST && PORT) return { host: HOST, port: Number(PORT) }
  throw new Error('Set SANCTUM_API_URL, or PORT (cloud), or both HOST and PORT')
}

export function resolveDashboardUrl(): string {
  loadRepoEnv()
  if (process.env.DASHBOARD_URL) return stripSlash(process.env.DASHBOARD_URL)
  const { DASHBOARD_HOST, DASHBOARD_PORT } = process.env
  if (DASHBOARD_HOST && DASHBOARD_PORT) {
    return `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`
  }
  // API-only deploys (Render, etc.) — CORS placeholder until dashboard is hosted
  return 'http://127.0.0.1:5174'
}

export function resolveDashboardServer(): { host: string; port: number } {
  loadRepoEnv()
  const { DASHBOARD_HOST, DASHBOARD_PORT } = process.env
  if (DASHBOARD_HOST && DASHBOARD_PORT) {
    return { host: DASHBOARD_HOST, port: Number(DASHBOARD_PORT) }
  }
  if (process.env.DASHBOARD_URL) {
    const u = new URL(process.env.DASHBOARD_URL)
    const port = u.port
      ? Number(u.port)
      : u.protocol === 'https:'
        ? 443
        : 80
    return { host: u.hostname, port }
  }
  throw new Error('Set DASHBOARD_URL or both DASHBOARD_HOST and DASHBOARD_PORT in .env')
}

export function resolveOllamaUrl(): string {
  loadRepoEnv()
  if (!process.env.OLLAMA_URL) throw new Error('Set OLLAMA_URL in .env')
  return stripSlash(process.env.OLLAMA_URL)
}

export function resolveMarketingServer(): { host: string; port: number } {
  loadRepoEnv()
  const { SITE_HOST, SITE_PORT } = process.env
  if (SITE_HOST && SITE_PORT) return { host: SITE_HOST, port: Number(SITE_PORT) }
  throw new Error('Set SITE_HOST and SITE_PORT in .env for the marketing site')
}
