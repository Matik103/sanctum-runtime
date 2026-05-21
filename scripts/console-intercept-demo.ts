/**
 * Console HITL demo — offline heuristics vs online risk model on the same action.
 *
 * Local (Ollama recommended):
 *   npm run dev:runtime
 *   npm run demo:console
 *   Open http://127.0.0.1:5174 — use Review next (A approve / D deny)
 *
 * Production console:
 *   SANCTUM_API_URL=https://api.sanctumruntime.com SANCTUM_API_KEY=… npm run demo:console
 *   Open https://console.sanctumruntime.com
 */
import { apiRequestHeaders, loadRepoEnv, resolveSanctumApiUrl } from './env.ts'

loadRepoEnv()
const API = resolveSanctumApiUrl()

const UNLOCK = {
  actor: 'console-demo',
  action: 'unlock_door',
  context: {
    time: '02:13 AM',
    owner_sleeping: true,
    location: 'front_door',
    channel: 'voice',
    heard: 'Open the front door — everyone is asleep upstairs.',
    intent: 'Night-time entry without waking the household',
  },
}

type VerifyResult = {
  id: string
  decision: string
  risk: string
  evaluationMode?: string
  modelInvoked?: boolean
  offlineMode?: boolean
}

async function verify(offlineMode: boolean, label: string) {
  const res = await fetch(`${API}/v1/actions/verify`, {
    method: 'POST',
    headers: apiRequestHeaders(),
    body: JSON.stringify({ ...UNLOCK, offlineMode }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${text}`)
  const r = JSON.parse(text) as VerifyResult
  console.log(`\n▸ ${label}`)
  console.log(`  decision=${r.decision} risk=${r.risk}`)
  console.log(`  mode=${r.evaluationMode ?? (r.offlineMode ? 'offline' : 'online')} modelInvoked=${r.modelInvoked}`)
  if (r.decision === 'REQUIRE_VERIFICATION') {
    console.log('  → Open Mission control and click Review next (or press A / D)')
  }
  return r
}

async function main() {
  console.log(`\nSanctum console intercept demo → ${API}\n`)

  const statusRes = await fetch(`${API}/v1/status`, { headers: apiRequestHeaders(false) })
  if (!statusRes.ok) {
    console.error(`API unreachable (${statusRes.status}). Start: npm run dev:runtime`)
    process.exit(1)
  }
  const status = (await statusRes.json()) as {
    riskModelConnected?: boolean
    ollamaConnected?: boolean
    riskProvider?: string
    riskModel?: string
    ollamaModel?: string
  }
  const modelUp = status.riskModelConnected ?? status.ollamaConnected
  console.log(
    `Runtime: provider=${status.riskProvider ?? '—'} model=${status.riskModel ?? status.ollamaModel ?? '—'} connected=${modelUp}`,
  )
  if (!modelUp) {
    console.log(
      '\nTip: For “Online · model used” on step 2, run Ollama locally or set OPENAI_API_KEY + SANCTUM_RISK_PROVIDER=openai.',
    )
    console.log('On Render, set SANCTUM_OFFLINE_MODE=false and a risk provider to enable the model.\n')
  }

  await verify(true, 'Step 1 — unlock_door (offlineMode: true, heuristics only)')
  await sleep(1200)
  await verify(false, 'Step 2 — unlock_door (offlineMode: false, risk model if connected)')
  await sleep(1200)
  await verify(
    false,
    'Step 3 — read_calendar (offlineMode: false, low-risk approve baseline)',
  )

  console.log('\nDone — refresh Overview / Runtime activity on the dashboard.\n')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
