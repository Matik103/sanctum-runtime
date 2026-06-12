#!/usr/bin/env node
/**
 * Production A–Z validation — every shipped surface from acquisition to enterprise.
 *
 * Prerequisites (.env + .env.e2e.local from npm run e2e:bootstrap):
 *   SUPABASE_*, TEST_USER_EMAIL, SANCTUM_E2E_API_KEY, TEST_PLATFORM_KEY (OpenAI)
 *
 * Optional (.env.a2z.local — gitignored):
 *   A2Z_USER_EMAIL, A2Z_USER_PASSWORD  (browser login; defaults to TEST_USER_EMAIL)
 *
 * Usage:
 *   npm run a2z              # production API + console
 *   npm run a2z:local        # also starts local API and runs local smoke
 *   A2Z_SKIP_BROWSER=1 npm run a2z
 */
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadA2zEnv,
  PROD_API,
  PROD_CONSOLE,
  PROD_MARKETING,
  localApiUrl,
  createReporter,
  waitForHealth,
  apiJson,
  requireSupabase,
  signInWithPassword,
  operatorJwtViaMagicLink,
  resolveOpenAiKey,
  e2eBootstrapExists,
  apiKeyHeader,
} from './a2z/lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadA2zEnv()

const RUN_LOCAL = process.argv.includes('--local') || process.env.A2Z_RUN_LOCAL === 'true'
const SKIP_BROWSER = process.env.A2Z_SKIP_BROWSER === 'true'
const r = createReporter()

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...extraEnv },
    })
    child.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`)),
    )
  })
}

async function checkPublicSurfaces() {
  r.section('A — Public surfaces (marketing, docs, crawl)')
  const urls = [
    ['marketing home', `${PROD_MARKETING}/`],
    ['docs', `${PROD_MARKETING}/docs`],
    ['console', `${PROD_CONSOLE}/`],
    ['api health', `${PROD_API}/health`],
    ['sitemap', `${PROD_MARKETING}/sitemap.xml`],
    ['robots', `${PROD_MARKETING}/robots.txt`],
  ]
  for (const [name, url] of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok || (name === 'console' && res.status === 200)) r.ok(`${name} ${res.status}`)
      else r.bad(name, res.status)
    } catch (e) {
      r.bad(name, e.message)
    }
  }
  try {
    await run('npm', ['run', 'verify:crawl'])
    r.ok('verify:crawl')
  } catch (e) {
    r.bad('verify:crawl', e.message)
  }
  try {
    const cors = await fetch(`${PROD_API}/health`, {
      headers: { Origin: PROD_CONSOLE },
    })
    const allow = cors.headers.get('access-control-allow-origin')
    if (allow === PROD_CONSOLE) r.ok('CORS console → api')
    else r.bad('CORS console → api', allow ?? 'missing header')
  } catch (e) {
    r.bad('CORS', e.message)
  }
}

async function checkAuthIdentity(email, password) {
  r.section('B — Auth & identity (Supabase + my_profile)')
  if (!password) {
    r.skip('password sign-in (set A2Z_USER_PASSWORD in .env.a2z.local)')
  } else {
    try {
      const { jwt, userId } = await signInWithPassword(email, password)
      r.ok('password sign-in')

      const { url, anonKey } = requireSupabase()
      const sb = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      })
      const { data: profile, error: profErr } = await sb
        .from('my_profile')
        .select('portal_type, subscription_plan_id, billing_org_id')
        .maybeSingle()
      if (profErr) r.bad('my_profile view', profErr.message)
      else if (!profile?.portal_type) r.bad('my_profile', 'missing portal_type')
      else r.ok(`my_profile portal=${profile.portal_type} plan=${profile.subscription_plan_id ?? 'null'}`)

      const { data: direct } = await sb.from('profiles').select('portal_type').eq('id', userId).maybeSingle()
      if (direct?.portal_type) r.ok('profiles direct (RLS own row)')
      else r.bad('profiles direct')

      const { data: joined, error: rpcErr } = await sb.rpc('bootstrap_enterprise_org_for_user')
      if (rpcErr) r.bad('bootstrap_enterprise_org_for_user', rpcErr.message)
      else r.ok(`enterprise bootstrap RPC (${joined ?? 'no domain match'})`)
    } catch (e) {
      r.bad('auth identity', e.message)
    }
  }

  try {
    const probe = await apiJson(PROD_API, '/v1/account/profile')
    if (probe.res.status === 401) r.ok('account profile requires auth')
    else r.bad('account profile auth gate', probe.res.status)
  } catch (e) {
    r.bad('account profile route', e.message)
  }
}

async function checkCoreVerify(api, label, key) {
  r.section(`C — Core runtime trust (${label})`)
  const headers = key ? { 'X-Sanctum-Key': key } : {}

  try {
    const health = await apiJson(api, '/health')
    if (health.res.ok && health.json?.ok) {
      r.ok(`health risk=${health.json.riskModel?.provider ?? '?'} connected=${Boolean(health.json.riskModel?.connected)}`)
    } else r.bad('health', health.res.status)
  } catch (e) {
    r.bad('health', e.message)
  }

  try {
    const offline = await apiJson(api, '/v1/actions/verify', {
      method: 'POST',
      headers,
      body: {
        actor: `a2z-offline-${Date.now()}`,
        action: 'unlock_door',
        context: { time: '02:00 AM', owner_sleeping: true },
        offlineMode: true,
      },
    })
    if (offline.res.ok && ['REQUIRE_VERIFICATION', 'BLOCKED'].includes(offline.json?.decision)) {
      r.ok(`verify offline → ${offline.json.decision}`)
    } else r.bad('verify offline', offline.text?.slice(0, 120))
  } catch (e) {
    r.bad('verify offline', e.message)
  }

  const openai = resolveOpenAiKey()
  if (!openai) {
    r.skip('verify online (set OPENAI_API_KEY or TEST_PLATFORM_KEY)')
  } else {
    try {
      const online = await apiJson(api, '/v1/actions/verify', {
        method: 'POST',
        headers,
        body: {
          actor: `a2z-online-${Date.now()}`,
          action: 'transfer_funds',
          context: { amount: 50000, recipient: 'unknown@offshore.example', urgent: true },
          offlineMode: false,
        },
      })
      if (online.res.ok && online.json?.decision) {
        r.ok(`verify online (OpenAI) → ${online.json.decision} risk=${online.json.risk}`)
      } else r.bad('verify online', online.text?.slice(0, 120))
    } catch (e) {
      r.bad('verify online', e.message)
    }
  }

  try {
    const audit = await apiJson(api, '/v1/audit?limit=3', { headers })
    if (audit.res.ok && Array.isArray(audit.json)) r.ok(`audit log (${audit.json.length} recent)`)
    else r.bad('audit', audit.res.status)
  } catch (e) {
    r.bad('audit', e.message)
  }
}

async function checkDashboardApiRoutes(email, orgId, key) {
  r.section('F — Dashboard API routes (JWT + API key)')
  let jwt
  try {
    ;({ jwt } = await operatorJwtViaMagicLink(email))
    r.ok('operator JWT via magic link')
  } catch (e) {
    r.bad('operator JWT', e.message)
    return
  }

  const authH = { Authorization: `Bearer ${jwt}` }
  const keyH = key ? { 'X-Sanctum-Key': key } : {}

  const jwtRoutes = [
    [`GET /v1/operator/context`, `/v1/operator/context`],
    [`GET /v1/account/profile`, `/v1/account/profile`],
    [`GET /v1/billing/plan`, `/v1/billing/plan?org_id=${encodeURIComponent(orgId)}`],
    [`GET connect settings`, `/v1/orgs/${orgId}/connect/settings`],
    [`GET connect health`, `/v1/orgs/${orgId}/connect/health`],
    [`GET org domains`, `/v1/orgs/${orgId}/domains`],
  ]
  for (const [label, path] of jwtRoutes) {
    const { res } = await apiJson(PROD_API, path, { headers: authH })
    if (res.ok) r.ok(label)
    else if (label === 'GET org domains' && res.status === 400 && orgId.startsWith('personal-')) {
      r.ok('GET org domains rejects personal workspace (expected — use org tenant for SSO)')
    } else if (res.status === 402) r.skip(`${label} (plan gate ${res.status})`)
    else r.bad(label, res.status)
  }

  if (!key) {
    r.skip('API key routes (no SANCTUM_E2E_API_KEY)')
    return
  }

  const keyRoutes = [
    ['GET /v1/status', '/v1/status'],
    ['GET /v1/policies', `/v1/policies?org_id=${encodeURIComponent(orgId)}`],
    ['GET /v1/runtimes', '/v1/runtimes'],
    ['GET /v1/fleet/map', `/v1/fleet/map?org_id=${encodeURIComponent(orgId)}`],
    ['GET /v1/usage', `/v1/usage?org_id=${encodeURIComponent(orgId)}&days=7`],
    ['GET workflows', `/v1/orgs/${orgId}/workflows`],
    ['GET approvals', `/v1/orgs/${orgId}/approvals`],
    [
      'GET compliance/report',
      `/v1/orgs/${orgId}/compliance/report?start=${encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}`,
    ],
    [
      'GET compliance/soc2',
      `/v1/orgs/${orgId}/compliance/soc2?start=${encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString())}&end=${encodeURIComponent(new Date().toISOString())}`,
    ],
    ['GET compliance/anomaly-timeline', `/v1/orgs/${orgId}/compliance/anomaly-timeline?days=7`],
    ['GET policy-snapshots', `/v1/orgs/${orgId}/policy-snapshots`],
    ['GET marketplace', `/v1/marketplace/packages?org_id=${encodeURIComponent(orgId)}`],
    ['GET alerts', `/v1/alerts?org_id=${encodeURIComponent(orgId)}`],
    ['GET push vapid', '/v1/push/vapid-key'],
    ['GET webhooks status', '/v1/webhooks/status'],
  ]
  for (const [label, path] of keyRoutes) {
    const { res, json } = await apiJson(PROD_API, path, { headers: keyH })
    if (res.ok) {
      if (label.includes('marketplace')) {
        const n = Array.isArray(json) ? json.length : json?.packages?.length ?? 0
        r.ok(`${label} (${n} packages)`)
      } else r.ok(label)
    } else if (res.status === 402) r.skip(`${label} (plan gate)`)
    else r.bad(label, res.status)
  }
}

async function checkDeveloperTierGating(admin) {
  r.section('L — Developer tier gating (free observer plan)')
  const ts = Date.now()
  const email = `a2z-dev-${ts}@sanctum-e2e.test`
  const password = `A2z-Dev-${ts}!Xx`
  let userId
  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        signup_type: 'individual',
        portal_type: 'operator',
        display_name: 'A2Z Dev',
        country_code: 'US',
        terms_accepted_at: new Date().toISOString(),
        terms_version: '2025-05',
      },
    })
    if (error) throw error
    userId = created.user?.id
    if (!userId) throw new Error('no user id')

    await new Promise((res) => setTimeout(res, 1500))

    const { url, anonKey } = requireSupabase()
    const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: signIn, error: inErr } = await auth.auth.signInWithPassword({ email, password })
    if (inErr) throw inErr
    const jwt = signIn.session?.access_token
    if (!jwt) throw new Error('no jwt')

    const ctx = await apiJson(PROD_API, '/v1/operator/context', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const orgId = ctx.json?.organizationIds?.[0]
    if (!orgId) throw new Error('no org')

    const { data: planRow } = await admin.from('org_plans').select('plan_id').eq('org_id', orgId).maybeSingle()
    if (planRow?.plan_id === 'observer' || planRow?.plan_id === 'free') r.ok('new user on Developer/observer plan')
    else r.bad('developer plan', planRow?.plan_id)

    const polPost = await apiJson(PROD_API, '/v1/policies', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: { action: 'a2z_test_action', requiresVerification: true, org_id: orgId },
    })
    if (polPost.res.status === 402) r.ok('policy create blocked on Developer (402)')
    else r.bad('policy create gate', polPost.res.status)

    const keyPost = await apiJson(PROD_API, '/v1/api-keys', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: { name: 'a2z-test', org_id: orgId },
    })
    if (keyPost.res.status === 402) r.ok('API key create blocked on Developer (402)')
    else r.bad('API key gate', keyPost.res.status)

    const polGet = await apiJson(PROD_API, `/v1/policies?org_id=${encodeURIComponent(orgId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    if (polGet.res.ok) r.ok('policy read allowed on Developer')
    else r.bad('policy read', polGet.res.status)
  } catch (e) {
    r.bad('developer tier test', e.message)
  } finally {
    if (userId) {
      try {
        await admin.auth.admin.deleteUser(userId)
        r.ok('developer test user cleaned up')
      } catch {
        r.skip('developer test user cleanup failed')
      }
    }
  }
}

async function checkMigrations() {
  r.section('M — Database migrations & plan alignment')
  try {
    await run('npm', ['run', 'plans:verify'])
    r.ok('plans:verify')
  } catch (e) {
    r.bad('plans:verify', e.message)
  }
}

async function runBrowserSmoke(email, password) {
  r.section('N — Browser smoke (Playwright → console)')
  if (SKIP_BROWSER) {
    r.skip('browser (A2Z_SKIP_BROWSER=1)')
    return
  }
  if (!password) {
    r.skip('browser (set A2Z_USER_PASSWORD in .env.a2z.local)')
    return
  }
  try {
    await run('npx', ['playwright', 'test', '--config=playwright.config.ts'], {
      A2Z_USER_EMAIL: email,
      A2Z_USER_PASSWORD: password,
      A2Z_CONSOLE_URL: PROD_CONSOLE,
    })
    r.ok('Playwright dashboard smoke')
  } catch (e) {
    r.bad('Playwright dashboard smoke', e.message)
  }
}

async function main() {
  console.log('\nSanctum Production A–Z Validation\n')

  const email =
    process.env.A2Z_USER_EMAIL?.trim() ||
    process.env.TEST_USER_EMAIL?.trim() ||
    process.env.A2Z_USER_EMAIL
  const password = process.env.A2Z_USER_PASSWORD?.trim()
  const openai = resolveOpenAiKey()

  if (!email) {
    console.error('Set TEST_USER_EMAIL (bootstrap) or A2Z_USER_EMAIL')
    process.exit(1)
  }
  if (!e2eBootstrapExists()) {
    console.log('Running e2e:bootstrap first…\n')
    await run('npm', ['run', 'e2e:bootstrap'], { TEST_USER_EMAIL: email })
    loadA2zEnv()
  }

  const orgId = process.env.SANCTUM_ORG_ID?.trim()
  const key = apiKeyHeader()
  if (!orgId || !key) {
    r.bad('E2E bootstrap', 'missing SANCTUM_ORG_ID or SANCTUM_E2E_API_KEY — run npm run e2e:bootstrap')
  } else {
    r.ok(`E2E org ${orgId}, API key present`)
  }

  if (!openai) {
    console.warn('⚠ No OPENAI_API_KEY / TEST_PLATFORM_KEY — online risk model checks will skip\n')
  } else {
    r.ok('OpenAI key available for online verify + Connect')
  }

  r.section('Unit tests')
  try {
    await run('npm', ['test'])
    r.ok('vitest (194+ tests)')
  } catch (e) {
    r.bad('vitest', e.message)
  }

  await checkPublicSurfaces()
  await checkAuthIdentity(email, password)
  await checkCoreVerify(PROD_API, 'production', key)

  let localUp = false
  if (RUN_LOCAL) {
    const local = localApiUrl()
    localUp = await waitForHealth(local, 3000)
    if (!localUp) {
      r.section('Local API startup')
      const child = spawn('npm', ['run', 'dev:api'], {
        cwd: root,
        stdio: 'ignore',
        detached: true,
        env: {
          ...process.env,
          HOST: process.env.HOST || '127.0.0.1',
          PORT: process.env.PORT || '3001',
          SANCTUM_RISK_PROVIDER: 'openai',
          OPENAI_API_KEY: openai,
          OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          SANCTUM_OFFLINE_MODE: 'false',
        },
      })
      child.unref()
      localUp = await waitForHealth(local, 60000)
      if (localUp) r.ok(`local API ${local}`)
      else r.bad('local API startup', local)
    } else {
      r.ok(`local API already up ${local}`)
    }
    if (localUp) {
      await checkCoreVerify(local, 'local', process.env.SANCTUM_API_KEY || key)
      try {
        await run('npm', ['run', 'smoke'], { SANCTUM_API_URL: local, SANCTUM_E2E_API_KEY: '' })
        r.ok('local npm run smoke')
      } catch (e) {
        r.bad('local smoke', e.message)
      }
    }
  } else {
    r.skip('local API (--local or A2Z_RUN_LOCAL=true to enable)')
  }

  r.section('D/E — SDK + Connect (production scripts)')
  const childScripts = [
    ['connect-watch (real actions)', 'node', ['scripts/test-connect-watch.mjs'], { SANCTUM_API_URL: PROD_API }],
    ['signup-forms', 'npm', ['run', 'test:signup-forms']],
    ['accounts-e2e', 'npm', ['run', 'test:accounts-e2e']],
    ['connect-full', 'node', ['scripts/test-connect-full.mjs'], { SANCTUM_API_URL: PROD_API }],
    ['connect-live-feed', 'node', ['scripts/test-connect-live-feed.mjs'], { SANCTUM_API_URL: PROD_API }],
    ['control-plane', 'npm', ['run', 'smoke:control-plane'], { SANCTUM_API_URL: PROD_API }],
  ]
  for (const [name, cmd, args, env = {}] of childScripts) {
    try {
      await run(cmd, args, env)
      r.ok(name)
    } catch (e) {
      r.bad(name, e.message)
    }
  }

  if (orgId) await checkDashboardApiRoutes(email, orgId, key)

  r.section('H — Module write flows (policies, shield, workflows, fleet, …)')
  if (orgId && key) {
    try {
      await run('node', ['scripts/test-modules-write.mjs'], { SANCTUM_API_URL: PROD_API })
      r.ok('module write flows')
    } catch (e) {
      r.bad('module write flows', e.message)
    }
  } else {
    r.skip('module write flows (bootstrap required)')
  }

  r.section('H2 — Console pages (per-sidebar API smoke)')
  if (orgId && key) {
    try {
      await run('node', ['scripts/test-pages-production.mjs'], { SANCTUM_API_URL: PROD_API })
      r.ok('console page smoke (22 pages)')
    } catch (e) {
      r.bad('console page smoke', e.message)
    }
  } else {
    r.skip('console page smoke (bootstrap required)')
  }

  r.section('G — Fleet & attestation (inline)')
  if (key && orgId) {
    const challenge = await apiJson(
      PROD_API,
      `/v1/attestation/challenge?org_id=${encodeURIComponent(orgId)}`,
      { headers: { 'X-Sanctum-Key': key } },
    )
    if (challenge.res.ok) r.ok('attestation challenge')
    else r.bad('attestation challenge', challenge.res.status)
  }

  r.section('I — Billing (Creem webhook optional)')
  if (process.env.CREEM_WEBHOOK_SECRET?.trim()) {
    try {
      await run('npm', ['run', 'test:creem-webhook'], {
        VITE_SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      })
      r.ok('creem webhook test')
    } catch (e) {
      r.bad('creem webhook', e.message)
    }
  } else {
    r.skip('Creem webhook (set CREEM_WEBHOOK_SECRET to test)')
  }

  try {
    const { url, serviceKey } = requireSupabase()
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    await checkDeveloperTierGating(admin)
  } catch (e) {
    r.bad('developer tier section', e.message)
  }

  await checkMigrations()

  r.section('Production deployment check')
  try {
    await run('npm', ['run', 'production:check'], {
      SANCTUM_API_URL: PROD_API,
      DASHBOARD_URL: PROD_CONSOLE,
    })
    r.ok('production:check')
  } catch (e) {
    r.bad('production:check', e.message)
  }

  await runBrowserSmoke(email, password)

  const { passed, failed, skipped } = r.summary()
  console.log(
    failed
      ? `\n❌ A–Z finished: ${passed} passed, ${failed} failed, ${skipped} skipped\n`
      : `\n✅ A–Z finished: ${passed} passed, ${skipped} skipped — production ready\n`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
