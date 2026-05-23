/**
 * Quick production readiness check (API + optional webhooks + Supabase hint).
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... npm run production:check
 */
const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY = process.env.SANCTUM_API_KEY?.trim()
const DASHBOARD = process.env.DASHBOARD_URL?.replace(/\/$/, '')

if (!API) {
  console.error('Set SANCTUM_API_URL')
  process.exit(1)
}

let failed = 0
function ok(m) {
  console.log(`✓ ${m}`)
}
function bad(m, d) {
  failed++
  console.error(`✗ ${m}${d ? ` — ${d}` : ''}`)
}

async function get(path, auth = false) {
  const headers = {}
  if (auth && KEY) headers['X-Sanctum-Key'] = KEY
  const res = await fetch(`${API}${path}`, { headers })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function main() {
  console.log(`Production check → ${API}\n`)

  try {
    const health = await get('/health')
    if (health.status === 200 && health.body?.ok) {
      ok(`GET /health (policies=${health.body.policyCount}, audit=${health.body.auditCount})`)
    } else bad('GET /health', health.status)
  } catch (e) {
    bad('GET /health', e.message)
  }

  try {
    const pushKey = await get('/v1/push/vapid-key')
    if (pushKey.status !== 200) {
      bad('GET /v1/push/vapid-key (public push enrollment)', pushKey.status)
    } else if (pushKey.body?.publicKey) {
      ok('GET /v1/push/vapid-key (web push configured)')
    } else {
      bad('web push configuration', 'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not fully configured on API')
    }
  } catch (e) {
    bad('GET /v1/push/vapid-key', e.message)
  }

  if (KEY) {
    try {
      const status = await get('/v1/status', true)
      if (status.status === 200) ok('GET /v1/status (authenticated)')
      else bad('GET /v1/status', status.status)
    } catch (e) {
      bad('GET /v1/status', e.message)
    }

    try {
      const hooks = await get('/v1/webhooks/status', true)
      if (hooks.status === 200) {
        ok(
          `webhooks configured=${hooks.body?.configured} urls=${hooks.body?.urlCount ?? 0}`,
        )
      } else bad('GET /v1/webhooks/status', hooks.status)
    } catch (e) {
      bad('webhooks status', e.message)
    }

    try {
      const usageOrg = process.env.SANCTUM_ORG_ID?.trim()
      if (usageOrg) {
        const usage = await fetch(
          `${API}/v1/usage?org_id=${encodeURIComponent(usageOrg)}&days=7`,
          { headers: { 'X-Sanctum-Key': KEY } },
        )
        if (usage.ok) ok('GET /v1/usage')
        else bad('GET /v1/usage', usage.status)
      }
    } catch (e) {
      bad('GET /v1/usage', e.message)
    }

    try {
      const mapOrg = process.env.SANCTUM_ORG_ID?.trim()
      if (mapOrg) {
        const map = await fetch(`${API}/v1/fleet/map?org_id=${encodeURIComponent(mapOrg)}`, {
          headers: { 'X-Sanctum-Key': KEY },
        })
        if (map.ok) {
          const body = await map.json()
          ok(`GET /v1/fleet/map (${body.summary?.runtimes ?? 0} runtimes, ${body.regions?.length ?? 0} regions)`)
        } else bad('GET /v1/fleet/map', map.status)
      }
    } catch (e) {
      bad('GET /v1/fleet/map', e.message)
    }

    try {
      const root = await get('/')
      const hasRuntimes = root.body?.endpoints?.runtimes
      if (hasRuntimes) ok('control plane routes advertised on GET /')
      else bad('control plane not deployed yet (redeploy API after push)')
    } catch (e) {
      bad('GET /', e.message)
    }

    try {
      const runtimes = await get('/v1/runtimes', true)
      if (runtimes.status === 200) {
        const n = Array.isArray(runtimes.body) ? runtimes.body.length : 0
        const verified = Array.isArray(runtimes.body)
          ? runtimes.body.filter((r) => r.attestation_status === 'verified').length
          : 0
        ok(`GET /v1/runtimes (${n} registered, ${verified} verified)`)
      } else bad('GET /v1/runtimes', runtimes.status)
    } catch (e) {
      bad('GET /v1/runtimes', e.message)
    }
  } else {
    console.log('○ Set SANCTUM_API_KEY to test authenticated routes')
  }

  if (DASHBOARD) {
    try {
      const res = await fetch(DASHBOARD, { method: 'HEAD' })
      if (res.ok) ok(`dashboard reachable (${DASHBOARD})`)
      else bad('dashboard HEAD', res.status)
    } catch (e) {
      bad('dashboard reachable', e.message)
    }
  } else {
    console.log('○ Set DASHBOARD_URL to probe hosted dashboard')
  }

  console.log(
    '\nSupabase: confirm audit_events rows in Table Editor after a verify call.',
  )
  console.log('Full checklist: PRODUCTION_OPS.md §6\n')

  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
