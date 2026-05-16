/**
 * External-app smoke test — only published npm packages (no monorepo paths).
 * Prereq: npm run dev:api (or dev:runtime) in repo root.
 *
 * From repo (loads .env):  npm run example:npm
 * Standalone:             SANCTUM_API_URL=http://127.0.0.1:3001 node run.mjs
 */
import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

const repoEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env')
if (existsSync(repoEnv)) config({ path: repoEnv })

const baseUrl =
  process.env.SANCTUM_API_URL ??
  (process.env.HOST && process.env.PORT
    ? `http://${process.env.HOST}:${process.env.PORT}`
    : undefined)
if (!baseUrl) {
  console.error('Set SANCTUM_API_URL or HOST+PORT in .env (see START_HERE.md)')
  process.exit(1)
}

const sanctum = new SanctumRuntime({
  baseUrl,
  apiKey: process.env.SANCTUM_API_KEY,
})

const health = await fetch(`${baseUrl}/health`)
if (!health.ok) {
  console.error('API not reachable. Start: npm run dev:runtime')
  process.exit(1)
}

const { result } = await protectAgent(sanctum, {
  actor: 'npm-consumer',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'dev@example.com' },
  offlineMode: true,
  execute: async () => ({ ok: true }),
})

console.log(`✓ npm-consumer: ${result.decision} (${result.risk})`)
