/**
 * External-app smoke test — only published npm packages (no monorepo paths).
 * Prereq: npm run dev:runtime in repo root, SANCTUM_API_URL set.
 *
 *   npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
 *   SANCTUM_API_URL=http://127.0.0.1:3001 node examples/npm-consumer/run.mjs
 */
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

const baseUrl = process.env.SANCTUM_API_URL
if (!baseUrl) {
  console.error('Set SANCTUM_API_URL (e.g. http://127.0.0.1:3001)')
  process.exit(1)
}

const sanctum = new SanctumRuntime({ baseUrl })

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
