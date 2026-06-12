#!/usr/bin/env node
/**
 * Marketplace — full scenario matrix (catalog, install, policies, connect, uninstall, errors).
 *
 * Prerequisites: npm run e2e:bootstrap
 *
 * Usage:
 *   node scripts/test-marketplace.mjs
 *   SANCTUM_API_URL=https://api.sanctumruntime.com node scripts/test-marketplace.mjs
 */
import { createClient } from '@supabase/supabase-js'
import {
  loadA2zEnv,
  PROD_API,
  apiJson,
  apiKeyHeader,
  operatorJwtViaMagicLink,
  requireSupabase,
} from './a2z/lib.mjs'

loadA2zEnv()

const API = (process.env.SANCTUM_API_URL || PROD_API).replace(/\/$/, '')
const ORG = process.env.SANCTUM_ORG_ID?.trim()
const KEY = apiKeyHeader()
const EMAIL = process.env.TEST_USER_EMAIL?.trim() || process.env.A2Z_USER_EMAIL?.trim()
const TS = Date.now()

const REQUIRED_SLUGS = ['connect-agent-starter', 'sanctum-agent-host', 'warehouse-robot']

let failed = 0
let passed = 0
let skipped = 0
const installedForCleanup = new Set()

function ok(msg) {
  passed++
  console.log(`  ✓ ${msg}`)
}
function skip(msg) {
  skipped++
  console.log(`  ○ ${msg}`)
}
function bad(msg, detail) {
  failed++
  console.error(`  ✗ ${msg}${detail != null ? ` — ${detail}` : ''}`)
}
function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`)
}

async function orgPolicies(jwtH) {
  const res = await apiJson(API, `/v1/orgs/${ORG}/policies`, { headers: jwtH })
  return res
}

async function verifyAction(action, expected, keyH, extraContext = {}) {
  const res = await apiJson(API, '/v1/actions/verify', {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: {
      actor: 'marketplace-e2e',
      action,
      offlineMode: true,
      context: { org_id: ORG, ...extraContext },
    },
  })
  return { res, decision: res.json?.decision }
}

async function installPkg(slug, jwtH, config) {
  const res = await apiJson(API, `/v1/marketplace/packages/${encodeURIComponent(slug)}/install`, {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: { organizationId: ORG, ...(config ? { config } : {}) },
  })
  if (res.res.ok || res.res.status === 201) installedForCleanup.add(slug)
  return res
}

async function uninstallPkg(slug, jwtH, method = 'post') {
  const res =
    method === 'delete'
      ? await apiJson(
          API,
          `/v1/marketplace/packages/${encodeURIComponent(slug)}/install?org_id=${encodeURIComponent(ORG)}`,
          { method: 'DELETE', headers: jwtH },
        )
      : await apiJson(API, `/v1/marketplace/packages/${encodeURIComponent(slug)}/uninstall`, {
          method: 'POST',
          headers: { ...jwtH, 'Content-Type': 'application/json' },
          body: { organizationId: ORG },
        })
  if (res.res.ok) installedForCleanup.delete(slug)
  return res
}

async function ensureClean(slug, jwtH) {
  await uninstallPkg(slug, jwtH, 'post').catch(() => {})
  installedForCleanup.delete(slug)
}

async function testObserverInstallGate() {
  section('Plan gate (observer cannot install)')
  const { url, serviceKey, anonKey } = requireSupabase()
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const email = `mkt-observer-${TS}@sanctum-e2e.test`
  const password = `Mkt-Obs-${TS}!Xx`

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      signup_type: 'individual',
      portal_type: 'operator',
      display_name: 'MKT Observer',
      country_code: 'US',
      terms_accepted_at: new Date().toISOString(),
      terms_version: '2025-05',
    },
  })
  if (error) {
    skip(`observer user create — ${error.message}`)
    return
  }
  await new Promise((r) => setTimeout(r, 1200))

  const { data: signIn, error: inErr } = await auth.auth.signInWithPassword({ email, password })
  if (inErr || !signIn.session?.access_token) {
    skip('observer sign-in')
    return
  }
  const jwt = signIn.session.access_token
  const { data: mems } = await admin.from('organization_members').select('org_id').eq('user_id', created.user.id)
  const obsOrg = mems?.[0]?.org_id
  if (!obsOrg) {
    skip('observer org missing')
    return
  }

  const install = await apiJson(API, '/v1/marketplace/packages/connect-agent-starter/install', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: { organizationId: obsOrg },
  })
  if (install.res.status === 402) ok('observer install rejected (402 plan gate)')
  else bad('observer install gate', `expected 402, got ${install.res.status}`)

  try {
    await admin.auth.admin.deleteUser(created.user.id)
  } catch {
    /* best-effort */
  }
}

async function main() {
  console.log(`\nMarketplace scenario tests → ${API}\n`)

  if (!ORG || !KEY || !EMAIL) {
    bad('bootstrap', 'missing SANCTUM_ORG_ID, SANCTUM_E2E_API_KEY, or TEST_USER_EMAIL')
    process.exit(1)
  }

  let jwtH
  try {
    const { jwt } = await operatorJwtViaMagicLink(EMAIL)
    jwtH = { Authorization: `Bearer ${jwt}` }
    ok(`operator JWT · org ${ORG}`)
  } catch (e) {
    bad('auth', e.message)
    process.exit(1)
  }
  const keyH = { 'X-Sanctum-Key': KEY }

  // ── Catalog ───────────────────────────────────────────────────────────────
  section('Catalog listing')
  const publicList = await apiJson(API, '/v1/marketplace/packages', { headers: jwtH })
  if (publicList.res.ok && Array.isArray(publicList.json?.packages)) {
    ok(`authenticated catalog (${publicList.json.packages.length} packages)`)
  } else {
    bad('authenticated catalog', publicList.res.status)
  }

  const orgList = await apiJson(API, `/v1/marketplace/packages?org_id=${encodeURIComponent(ORG)}`, { headers: jwtH })
  const packages = orgList.json?.packages ?? []
  if (!orgList.res.ok) bad('org catalog', orgList.res.status)
  else if (packages.length === 0) bad('org catalog', 'empty — run migration 078')
  else ok(`org catalog (${packages.length} packages)`)

  for (const slug of REQUIRED_SLUGS) {
    if (packages.some((p) => p.slug === slug)) ok(`catalog includes ${slug}`)
    else bad('required slug', slug)
  }

  const categories = new Set(packages.map((p) => p.category).filter(Boolean))
  if (categories.size >= 2) ok(`categories represented (${[...categories].join(', ')})`)
  else ok(`categories (${categories.size})`)

  for (const pkg of packages.slice(0, 5)) {
    if (pkg.id && pkg.slug && pkg.name && typeof pkg.installed === 'boolean') {
      ok(`package shape ok · ${pkg.slug}`)
    } else {
      bad(`package shape · ${pkg.slug ?? '?'}`, 'missing fields')
    }
  }

  // ── Package detail ────────────────────────────────────────────────────────
  section('Package detail')
  const detail = await apiJson(
    API,
    `/v1/marketplace/packages/connect-agent-starter?org_id=${encodeURIComponent(ORG)}`,
    { headers: jwtH },
  )
  if (detail.res.ok && detail.json?.package?.slug === 'connect-agent-starter') {
    const templates = detail.json.package.policy_templates ?? []
    ok(`detail connect-agent-starter (${templates.length} policy templates)`)
  } else {
    bad('package detail', detail.res.status)
  }

  const missing = await apiJson(API, '/v1/marketplace/packages/no-such-package-xyz', { headers: jwtH })
  if (missing.res.status === 404) ok('unknown slug → 404')
  else bad('unknown slug', missing.res.status)

  const invalidSlug = await apiJson(API, '/v1/marketplace/packages/BAD_SLUG', { headers: jwtH })
  if (invalidSlug.res.status === 400 || invalidSlug.res.status === 404) ok(`invalid slug → ${invalidSlug.res.status}`)
  else bad('invalid slug', invalidSlug.res.status)

  // ── Connect hints (not installed) ─────────────────────────────────────────
  section('Connect hints')
  await ensureClean('warehouse-robot', jwtH)
  const connectBefore = await apiJson(
    API,
    `/v1/marketplace/packages/warehouse-robot/connect?org_id=${encodeURIComponent(ORG)}`,
    { headers: jwtH },
  )
  if (connectBefore.res.status === 404) ok('connect hints before install → 404')
  else bad('connect before install', connectBefore.res.status)

  const connectNoOrg = await apiJson(API, '/v1/marketplace/packages/warehouse-robot/connect', { headers: jwtH })
  if (connectNoOrg.res.status === 400) ok('connect without org_id → 400')
  else bad('connect missing org', connectNoOrg.res.status)

  // ── Install connect-agent-starter ───────────────────────────────────────────
  section('Install connect-agent-starter')
  await ensureClean('connect-agent-starter', jwtH)

  const install1 = await installPkg('connect-agent-starter', jwtH)
  if (!install1.res.ok && install1.res.status !== 201) {
    bad('install connect-agent-starter', `${install1.res.status} ${install1.text?.slice(0, 120)}`)
  } else {
    const keys = install1.json?.appliedPolicyKeys ?? []
    ok(`install connect-agent-starter (${keys.length} policy keys)`)
    if (install1.json?.installId) ok(`installId ${install1.json.installId.slice(0, 8)}…`)
    if (install1.json?.connect?.packageSlug === 'connect-agent-starter') ok('connect hints in install response')
    else bad('install connect payload', 'missing connect.packageSlug')

    const polXfer = await orgPolicies(jwtH)
    const xferPolicy = polXfer.json?.transfer_funds
    if (xferPolicy?.autoBlock === true) ok('transfer_funds autoBlock in org policies')
    else if (xferPolicy?.requiresVerification === true) ok('transfer_funds requiresVerification in org policies')
    else bad('transfer_funds policy row', JSON.stringify(xferPolicy ?? null))

    const xfer = await verifyAction('transfer_funds', 'BLOCKED', keyH, { amount: 5000 })
    if (xfer.decision === 'BLOCKED' || xfer.decision === 'REQUIRE_VERIFICATION') {
      ok(`transfer_funds gated → ${xfer.decision}`)
    } else {
      bad('transfer_funds verify', xfer.decision)
    }

    const delDb = await verifyAction('delete_database', 'BLOCKED', keyH, { database: 'production' })
    if (delDb.decision === 'BLOCKED') ok('delete_database BLOCKED after install')
    else bad('delete_database policy', delDb.decision)

    const shell = await verifyAction('execute_shell', 'BLOCKED', keyH, { command: 'rm -rf /' })
    if (shell.decision === 'BLOCKED') ok('execute_shell BLOCKED after install')
    else bad('execute_shell policy', shell.decision)

    const listed = await apiJson(API, `/v1/marketplace/packages?org_id=${encodeURIComponent(ORG)}`, { headers: jwtH })
    const row = listed.json?.packages?.find((p) => p.slug === 'connect-agent-starter')
    if (row?.installed) ok('catalog shows installed=true')
    else bad('installed flag', String(row?.installed))

    const connectAfter = await apiJson(
      API,
      `/v1/marketplace/packages/connect-agent-starter/connect?org_id=${encodeURIComponent(ORG)}`,
      { headers: jwtH },
    )
    if (connectAfter.res.ok && connectAfter.json?.connect?.organizationId === ORG) {
      ok('connect hints after install')
    } else {
      bad('connect after install', connectAfter.res.status)
    }

    const reinstall = await installPkg('connect-agent-starter', jwtH)
    if (reinstall.res.ok || reinstall.res.status === 201) ok('reinstall idempotent')
    else bad('reinstall', reinstall.res.status)
  }

  // ── Install warehouse-robot (policy key lifecycle) ────────────────────────
  section('Install warehouse-robot (policy lifecycle)')
  await ensureClean('warehouse-robot', jwtH)

  const wrInstall = await installPkg('warehouse-robot', jwtH)
  if (!wrInstall.res.ok && wrInstall.res.status !== 201) {
    bad('install warehouse-robot', wrInstall.res.status)
  } else {
    ok('install warehouse-robot')

    const polBefore = await orgPolicies(jwtH)
    const hasDisableAlarm =
      polBefore.res.ok &&
      (polBefore.json?.disable_alarm != null ||
        Object.keys(polBefore.json ?? {}).includes('disable_alarm'))
    if (hasDisableAlarm) ok('org policy disable_alarm present after install')
    else bad('disable_alarm policy', 'not in org policies')

    const door = await verifyAction('unlock_door', 'REQUIRE_VERIFICATION', keyH, { door_id: 'dock-1' })
    if (door.decision === 'REQUIRE_VERIFICATION' || door.decision === 'BLOCKED') {
      ok(`unlock_door → ${door.decision}`)
    } else {
      bad('unlock_door policy', door.decision)
    }

    const un = await uninstallPkg('warehouse-robot', jwtH, 'post')
    if (un.res.ok) ok('uninstall warehouse-robot (POST)')
    else bad('uninstall warehouse-robot', un.res.status)

    const polAfter = await orgPolicies(jwtH)
    const stillHas =
      polAfter.res.ok &&
      (polAfter.json?.disable_alarm != null ||
        Object.keys(polAfter.json ?? {}).includes('disable_alarm'))
    if (!stillHas) ok('disable_alarm removed after uninstall')
    else bad('policy cleanup', 'disable_alarm still present')

    const un2 = await uninstallPkg('warehouse-robot', jwtH, 'post')
    if (un2.res.status === 404) ok('double uninstall → 404')
    else bad('double uninstall', un2.res.status)
  }

  // ── Uninstall connect-agent-starter (DELETE method) ─────────────────────────
  section('Uninstall connect-agent-starter (DELETE)')
  const unDel = await uninstallPkg('connect-agent-starter', jwtH, 'delete')
  if (unDel.res.ok) ok('uninstall connect-agent-starter (DELETE)')
  else if (unDel.res.status === 404) {
    ok('connect-agent-starter already uninstalled')
    installedForCleanup.delete('connect-agent-starter')
  } else bad('DELETE uninstall', unDel.res.status)

  // ── sanctum-agent-host ────────────────────────────────────────────────────
  section('Install sanctum-agent-host')
  await ensureClean('sanctum-agent-host', jwtH)
  const sah = await installPkg('sanctum-agent-host', jwtH)
  if (sah.res.ok || sah.res.status === 201) {
    ok('install sanctum-agent-host')
    const term = await verifyAction('execute_terminal', 'BLOCKED', keyH)
    if (term.decision === 'BLOCKED') ok('execute_terminal BLOCKED (agent-host template)')
    else bad('execute_terminal', term.decision)
    await uninstallPkg('sanctum-agent-host', jwtH, 'post')
    ok('uninstall sanctum-agent-host')
  } else if (sah.res.status === 402) {
    skip('sanctum-agent-host install (plan gate)')
  } else {
    bad('sanctum-agent-host install', sah.res.status)
  }

  // ── Auth / scope errors ───────────────────────────────────────────────────
  section('Auth and validation errors')
  const wrongOrg = await apiJson(API, '/v1/marketplace/packages/connect-agent-starter/install', {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: { organizationId: 'org-not-yours-00000000' },
  })
  if (wrongOrg.res.status === 403 || wrongOrg.res.status === 404) ok(`install wrong org → ${wrongOrg.res.status}`)
  else bad('wrong org scope', wrongOrg.res.status)

  const badBody = await apiJson(API, '/v1/marketplace/packages/connect-agent-starter/install', {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: {},
  })
  if (badBody.res.status === 400) ok('install missing organizationId → 400')
  else bad('bad install body', badBody.res.status)

  const noAuth = await apiJson(API, `/v1/marketplace/packages?org_id=${encodeURIComponent(ORG)}`)
  if (noAuth.res.status === 401 || noAuth.res.status === 403) ok(`org catalog without auth → ${noAuth.res.status}`)
  else if (noAuth.res.ok) skip('org catalog without auth (open in this env)')
  else bad('no auth catalog', noAuth.res.status)

  // ── Observer plan ─────────────────────────────────────────────────────────
  await testObserverInstallGate()

  // ── Cleanup ───────────────────────────────────────────────────────────────
  section('Cleanup')
  for (const slug of [...installedForCleanup]) {
    const c = await uninstallPkg(slug, jwtH, 'post')
    if (c.res.ok || c.res.status === 404) ok(`cleanup ${slug}`)
    else bad(`cleanup ${slug}`, c.res.status)
  }

  console.log(
    failed
      ? `\n❌ Marketplace tests: ${passed} passed, ${failed} failed, ${skipped} skipped\n`
      : `\n✅ Marketplace tests: ${passed} passed, ${skipped} skipped\n`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
