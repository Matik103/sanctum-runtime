/**
 * Full stack test — local API + production + enterprise routes + public URLs.
 *
 *   npm run test:all
 *   SANCTUM_API_URL=https://api.sanctumruntime.com SANCTUM_API_KEY=sk_sanctum_... npm run test:all
 */
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { loadRepoEnv } from './env.ts'

loadRepoEnv()

const LOCAL = process.env.SANCTUM_API_URL?.replace(/\/$/, '') || `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`
const PROD = 'https://api.sanctumruntime.com'
const KEY =
  process.env.SANCTUM_E2E_API_KEY?.trim() ||
  process.env.SANCTUM_API_KEY?.trim()
let ORG = process.env.SANCTUM_ORG_ID?.trim()
const isDashboardKey = KEY?.startsWith('sk_sanctum_') ?? false

let failed = 0
function ok(m) {
  console.log(`✓ ${m}`)
}
function bad(m, d) {
  failed++
  console.error(`✗ ${m}${d ? ` — ${d}` : ''}`)
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 50 - t.length))}`)
}

async function runNpm(script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', script], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...extraEnv },
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`))))
  })
}

async function resolveOrgId() {
  if (ORG) return ORG
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !serviceKey) return null
  const sb = createClient(url, serviceKey)
  const { data } = await sb.from('organizations').select('id').order('created_at', { ascending: true }).limit(1)
  return data?.[0]?.id ?? null
}

async function j(api, method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth && KEY) headers['X-Sanctum-Key'] = KEY
  const res = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = text
  }
  return { status: res.status, body: parsed }
}

async function testEnterprise(api, label) {
  section(`${label} enterprise routes`)

  const isLocalHost = /127\.0\.0\.1|localhost/.test(api)
  if (isLocalHost && isDashboardKey) {
    console.log(
      '○ Local enterprise routes skipped (sk_sanctum_* org scope is validated on production; local dev uses legacy SANCTUM_API_KEY pepper)',
    )
    return
  }

  if (!isDashboardKey) {
    console.log(
      '○ Enterprise routes need sk_sanctum_* from dashboard (Settings → API keys). Legacy SANCTUM_API_KEY only covers core runtime routes.',
    )
    return
  }

  let orgId = ORG || (await resolveOrgId())
  if (!orgId) {
    const ctx = await j(api, 'GET', '/v1/operator/context')
    if (ctx.status === 200) orgId = ctx.body?.defaultOrganizationId
  }
  if (!orgId) {
    bad('resolve org', 'set SANCTUM_ORG_ID or create an org in Supabase')
    return
  }
  ok(`org ${orgId}`)

  const workflows = await j(api, 'GET', `/v1/orgs/${orgId}/workflows`)
  if (workflows.status === 200) ok(`GET workflows (${(workflows.body ?? []).length})`)
  else bad('GET workflows', workflows.status)

  const approvals = await j(api, 'GET', `/v1/orgs/${orgId}/approvals`)
  if (approvals.status === 200) ok(`GET approvals (${(approvals.body ?? []).length})`)
  else bad('GET approvals', approvals.status)

  const snapshots = await j(api, 'GET', `/v1/orgs/${orgId}/policy-snapshots`)
  if (snapshots.status === 200) ok(`GET policy-snapshots (${(snapshots.body ?? []).length})`)
  else bad('GET policy-snapshots', snapshots.status)

  const end = new Date().toISOString()
  const start = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const report = await j(
    api,
    'GET',
    `/v1/orgs/${orgId}/compliance/report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  )
  if (report.status === 200 && report.body?.summary) {
    ok(
      `GET compliance/report (audit=${report.body.summary.total_actions ?? '—'}, anomalies=${report.body.summary.anomaly_flags ?? '—'})`,
    )
  } else bad('GET compliance/report', report.status)

  const soc2 = await j(api, 'GET', `/v1/orgs/${orgId}/compliance/soc2?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
  if (soc2.status === 200 && (soc2.body?.criteria ?? soc2.body?.controls)) {
    const n = (soc2.body.criteria ?? soc2.body.controls).length
    ok(`GET compliance/soc2 (${n} criteria)`)
  } else bad('GET compliance/soc2', soc2.status)

  const timeline = await j(api, 'GET', `/v1/orgs/${orgId}/compliance/anomaly-timeline?days=7`)
  if (timeline.status === 200) ok('GET compliance/anomaly-timeline')
  else bad('GET compliance/anomaly-timeline', timeline.status)
}

async function testPublicUrls() {
  section('Public URLs')
  try {
    const { execSync } = await import('node:child_process')
    execSync('node scripts/verify-crawl.mjs', { stdio: 'pipe', encoding: 'utf8' })
    ok('verify:crawl')
  } catch (e) {
    bad('verify:crawl', e.stderr || e.message)
  }
  const urls = [
    ['marketing', 'https://www.sanctumruntime.com/'],
    ['sitemap', 'https://www.sanctumruntime.com/sitemap.xml'],
    ['robots', 'https://www.sanctumruntime.com/robots.txt'],
    ['console', 'https://console.sanctumruntime.com/'],
    ['api', 'https://api.sanctumruntime.com/health'],
  ]
  for (const [name, url] of urls) {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow' })
      if (res.ok) ok(`${name} ${res.status}`)
      else bad(name, res.status)
    } catch (e) {
      bad(name, e.message)
    }
  }

  try {
    const res = await fetch('https://api.sanctumruntime.com/health', {
      headers: { Origin: 'https://console.sanctumruntime.com' },
    })
    const cors = res.headers.get('access-control-allow-origin')
    if (cors === 'https://console.sanctumruntime.com') ok('CORS console → api')
    else bad('CORS console → api', cors ?? 'missing')
  } catch (e) {
    bad('CORS check', e.message)
  }
}

async function main() {
  console.log('\nSanctum test-all\n')
  ORG = ORG || (await resolveOrgId())
  if (ORG) console.log(`Using org: ${ORG}`)
  if (KEY) console.log(`API key: ${isDashboardKey ? 'sk_sanctum_* (dashboard)' : 'legacy SANCTUM_API_KEY'}\n`)

  section('Local smoke (npm run smoke)')
  if (process.env.SANCTUM_SKIP_LOCAL_SMOKE === 'true') {
    console.log('○ Local smoke skipped (set SANCTUM_E2E_REQUIRE_LOCAL=true for local API gating)')
  } else {
    try {
      await runNpm('smoke')
      ok('local smoke script')
    } catch (e) {
      bad('local smoke', e.message)
    }
  }

  if (KEY) {
    await testEnterprise(LOCAL, 'Local')
  } else {
    console.log('○ Set SANCTUM_API_KEY to test enterprise routes')
  }

  section('Production API')
  try {
    const health = await j(PROD, 'GET', '/health', null, false)
    if (health.status === 200 && health.body?.ok) {
      const rm = health.body.riskModel
      ok(`health (risk=${rm?.provider}, connected=${rm?.connected}, policies=${health.body.policies?.count})`)
    } else bad('production health', health.status)
  } catch (e) {
    bad('production health', e.message)
  }

  if (KEY) {
    const status = await j(PROD, 'GET', '/v1/status')
    if (status.status === 200) ok('production /v1/status (auth)')
    else bad('production /v1/status', `${status.status} — use Render SANCTUM_API_KEY or sk_sanctum_* from dashboard`)

    if (status.status === 200) {
      await testEnterprise(PROD, 'Production')
    }

    if (isDashboardKey && ORG) {
      try {
        await runNpm('smoke:control-plane', {
          SANCTUM_API_URL: PROD,
          SANCTUM_ORG_ID: ORG,
        })
        ok('smoke:control-plane (production)')
      } catch {
        bad('smoke:control-plane', 'failed — check sk_sanctum key org matches SANCTUM_ORG_ID')
      }
    } else {
      console.log('○ smoke:control-plane skipped (needs sk_sanctum_* + SANCTUM_ORG_ID)')
    }
  } else {
    console.log('○ Set SANCTUM_API_KEY for production authenticated tests')
  }

  await testPublicUrls()

  console.log(failed ? `\n${failed} check(s) failed\n` : '\nAll test-all checks passed\n')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
