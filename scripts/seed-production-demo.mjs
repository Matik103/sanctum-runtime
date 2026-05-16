/**
 * Seed the hosted control plane with demo audit events (Phase 3).
 *
 *   SANCTUM_API_URL=https://sanctum-api-6zgy.onrender.com \
 *   SANCTUM_API_KEY=your-render-api-key \
 *   node scripts/seed-production-demo.mjs
 */
const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY = process.env.SANCTUM_API_KEY?.trim()

if (!API) {
  console.error('Set SANCTUM_API_URL')
  process.exit(1)
}
if (!KEY) {
  console.error('Set SANCTUM_API_KEY (Render → sanctum-api → Environment)')
  process.exit(1)
}

const SCENARIOS = [
  {
    label: 'approve — read calendar',
    body: {
      actor: 'demo-agent',
      action: 'read_calendar',
      context: { intent: 'Morning briefing for operator' },
      offlineMode: true,
    },
  },
  {
    label: 'verify — unlock door',
    body: {
      actor: 'warehouse-bot',
      action: 'unlock_door',
      context: {
        location: 'bay-3',
        time: '02:13 AM',
        heard: 'Open the door for the delivery.',
        intent: 'After-hours entry',
      },
      offlineMode: true,
    },
  },
  {
    label: 'block — delete production database',
    body: {
      actor: 'ops-script',
      action: 'delete_production_database',
      context: { intent: 'Cleanup old staging data' },
      offlineMode: true,
    },
  },
]

async function verify(body) {
  const res = await fetch(`${API}/v1/actions/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sanctum-Key': KEY,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return JSON.parse(text)
}

async function main() {
  console.log(`Seeding demo actions → ${API}\n`)

  const health = await fetch(`${API}/health`).then((r) => r.json())
  console.log(`Runtime: ${health.policyCount} policies loaded\n`)

  for (const s of SCENARIOS) {
    try {
      const result = await verify(s.body)
      console.log(`✓ ${s.label}`)
      console.log(`  decision=${result.decision} id=${result.id}\n`)
    } catch (e) {
      console.error(`✗ ${s.label}`, e.message)
      process.exitCode = 1
    }
  }

  const audit = await fetch(`${API}/v1/audit?limit=10`, {
    headers: { 'X-Sanctum-Key': KEY },
  }).then((r) => r.json())

  console.log(`Audit entries: ${audit.length}`)
  console.log('\nOpen https://sanctum-dashboard.onrender.com → Runtime Activity')
  console.log('Pending reviews: use Review next or keyboard A / D in the modal.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
