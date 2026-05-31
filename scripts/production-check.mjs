/**
 * Quick production readiness check (API + optional webhooks + Supabase hint).
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... npm run production:check
 */
const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY =
  process.env.SANCTUM_E2E_API_KEY?.trim() ||
  process.env.SANCTUM_API_KEY?.trim()
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

function hasRevalidateHeader(res) {
  const cacheControl = res.headers.get('cache-control') ?? ''
  return /\bmax-age=0\b/.test(cacheControl) && /\bmust-revalidate\b/.test(cacheControl)
}

async function checkDashboardDeployment() {
  const probe = `production-check=${Date.now()}`
  const launch = await fetch(`${DASHBOARD}/index.html?source=pwa&${probe}`, { cache: 'no-store' })
  if (!launch.ok) {
    bad('dashboard launch document', launch.status)
    return
  }
  if (hasRevalidateHeader(launch)) ok('dashboard launch document revalidates on PWA startup')
  else bad('dashboard launch document cache', launch.headers.get('cache-control') ?? 'missing Cache-Control')

  const html = await launch.text()
  const assets = [...new Set(
    [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]),
  )]
  if (!assets.length) {
    bad('dashboard entry assets', 'no hashed assets referenced by index.html')
  }
  for (const assetPath of assets) {
    const asset = await fetch(`${DASHBOARD}${assetPath}`, { cache: 'no-store' })
    const cacheControl = asset.headers.get('cache-control') ?? ''
    if (asset.status !== 200) {
      bad(
        `dashboard asset ${assetPath}`,
        `${asset.status}; purge cached error responses and set Cloudflare asset 404/5xx Edge TTL to 0`,
      )
    } else if (!/\bimmutable\b/.test(cacheControl)) {
      bad(`dashboard asset cache ${assetPath}`, cacheControl || 'missing Cache-Control')
    } else {
      ok(`dashboard asset available (${assetPath})`)
    }
  }

  const serviceWorker = await fetch(`${DASHBOARD}/sw.js?${probe}`, { cache: 'no-store' })
  if (serviceWorker.ok && hasRevalidateHeader(serviceWorker)) ok('dashboard service worker revalidates')
  else bad('dashboard service worker cache', serviceWorker.headers.get('cache-control') ?? serviceWorker.status)
}

async function main() {
  console.log(`Production check → ${API}\n`)

  try {
    const readiness = await get('/readiness')
    if (readiness.status === 200 && readiness.body?.ready) ok('GET /readiness (public process probe)')
    else bad('GET /readiness', readiness.status)
  } catch (e) {
    bad('GET /readiness', e.message)
  }

  try {
    const health = await get('/health')
    if (health.status === 200 && health.body?.ok) {
      const risk = health.body.riskModel
      ok(`GET /health (risk=${risk?.provider ?? 'unknown'}, connected=${Boolean(risk?.connected)})`)
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
      await checkDashboardDeployment()
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
