/**
 * Live dashboard exercise — run while watching http://127.0.0.1:5174
 * Usage: npm run monitor
 */
import { resolveSanctumApiUrl } from './env.ts'

const API = resolveSanctumApiUrl()

type Scenario = {
  label: string
  body: {
    actor: string
    action: string
    context: Record<string, unknown>
    offlineMode?: boolean
  }
}

const SCENARIOS: Scenario[] = [
  {
    label: 'Unlock door (online, night)',
    body: {
      actor: 'live-monitor',
      action: 'unlock_door',
      context: { time: '02:13 AM', owner_sleeping: true, location: 'front_door' },
      offlineMode: false,
    },
  },
  {
    label: 'Unlock door (offline)',
    body: {
      actor: 'live-monitor',
      action: 'unlock_door',
      context: { time: '02:13 AM', owner_sleeping: true },
      offlineMode: true,
    },
  },
  {
    label: 'Send email (online)',
    body: {
      actor: 'live-monitor',
      action: 'send_email',
      context: { to: 'user@example.com', subject: 'Hello' },
      offlineMode: false,
    },
  },
  {
    label: 'Send email (offline)',
    body: {
      actor: 'live-monitor',
      action: 'send_email',
      context: { to: 'user@example.com' },
      offlineMode: true,
    },
  },
  {
    label: 'Transfer funds (online)',
    body: {
      actor: 'live-monitor',
      action: 'transfer_funds',
      context: { amount: 50000, currency: 'USD', to: 'external@bank.com' },
      offlineMode: false,
    },
  },
  {
    label: 'Transfer funds (offline)',
    body: {
      actor: 'live-monitor',
      action: 'transfer_funds',
      context: { amount: 50000, currency: 'USD' },
      offlineMode: true,
    },
  },
  {
    label: 'Delete file (online)',
    body: {
      actor: 'live-monitor',
      action: 'delete_file',
      context: { path: '/etc/passwd' },
      offlineMode: false,
    },
  },
  {
    label: 'Execute terminal (online)',
    body: {
      actor: 'live-monitor',
      action: 'execute_terminal',
      context: { command: 'rm -rf /' },
      offlineMode: false,
    },
  },
  {
    label: 'Disable alarm (offline)',
    body: {
      actor: 'live-monitor',
      action: 'disable_alarm',
      context: { zone: 'perimeter' },
      offlineMode: true,
    },
  },
  {
    label: 'Lock door (online, low risk)',
    body: {
      actor: 'live-monitor',
      action: 'lock_door',
      context: { location: 'front_door', time: '10:00 AM' },
      offlineMode: false,
    },
  },
  {
    label: 'Move robot (online)',
    body: {
      actor: 'live-monitor',
      action: 'move_robot',
      context: { zone: 'warehouse', speed: 'normal' },
      offlineMode: false,
    },
  },
]

async function verify(s: Scenario) {
  const t0 = Date.now()
  const res = await fetch(`${API}/v1/actions/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s.body),
  })
  const ms = Date.now() - t0
  if (!res.ok) {
    console.log(`✗ ${s.label} → HTTP ${res.status}`)
    return
  }
  const r = (await res.json()) as {
    decision: string
    risk: string
    modelInvoked?: boolean
    evaluationMode?: string
  }
  const mode = r.modelInvoked ? 'model' : 'heuristic'
  console.log(
    `✓ ${s.label} → ${r.decision} (${r.risk}, ${mode}, ${ms}ms)`,
  )
}

async function main() {
  console.log(`\nSanctum live monitor → ${API}`)
  console.log(`Dashboard → check DASHBOARD_URL in .env (default :5174)\n`)

  const status = await fetch(`${API}/v1/status`).then((r) => r.json())
  console.log(
    `Runtime: ollama=${status.ollamaConnected} model=${status.ollamaModel} audit=${status.auditCount}\n`,
  )

  for (const s of SCENARIOS) {
    await verify(s)
    await sleep(800)
  }

  console.log('\nDone — watch Overview / Runtime activity on the dashboard.\n')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
