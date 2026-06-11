#!/usr/bin/env node
/**
 * Verify Creem test-mode configuration before billing E2E.
 *
 *   npm run creem:verify-test
 *
 * Reads CREEM_* from .env (or env). For each CREEM_PRODUCT_* secret, attempts
 * POST /v1/checkouts against test-api.creem.io and reports Creem errors verbatim.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadDotEnv() {
  const path = resolve(root, '.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadDotEnv()

const apiKey = (process.env.CREEM_API_KEY ?? '').trim().replace(/^["']|["']$/g, '')
const explicitBase = (process.env.CREEM_API_BASE_URL ?? '').trim().replace(/\/$/, '')
const isTestKey = apiKey.startsWith('creem_test_')
const base = explicitBase
  || (isTestKey || process.env.CREEM_TEST_MODE === 'true' ? 'https://test-api.creem.io' : 'https://api.creem.io')

const products = [
  ['CREEM_PRODUCT_PERSONAL', 'personal'],
  ['CREEM_PRODUCT_OPERATOR', 'operator'],
  ['CREEM_PRODUCT_TEAM', 'team'],
  ['CREEM_PRODUCT_ENTERPRISE', 'enterprise'],
]

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exitCode = 1
}

function ok(msg) {
  console.log(`✓ ${msg}`)
}

function warn(msg) {
  console.warn(`⚠ ${msg}`)
}

console.log('Creem test setup verification\n')

if (!apiKey) {
  fail('CREEM_API_KEY missing — add creem_test_* from Creem Dashboard → Developers (test mode on)')
  process.exit(1)
}

if (!apiKey.startsWith('creem_')) {
  warn('CREEM_API_KEY does not start with creem_ — Sanctum expects creem_test_* or creem_* per docs.creem.io')
}

const baseIsTest = base.includes('test-api')
if (isTestKey && !baseIsTest) {
  fail('Test key (creem_test_*) but CREEM_API_BASE_URL points to production. Set CREEM_API_BASE_URL=https://test-api.creem.io')
  process.exit(1)
}
if (!isTestKey && baseIsTest) {
  fail('Live key but CREEM_API_BASE_URL is test-api. Unset CREEM_API_BASE_URL or use https://api.creem.io')
  process.exit(1)
}

ok(`API base: ${base}`)
ok(`Key mode: ${isTestKey ? 'test' : 'live'}`)

if (!process.env.CREEM_WEBHOOK_SECRET?.trim()) {
  warn('CREEM_WEBHOOK_SECRET not set — webhooks will fail until configured')
} else {
  ok('CREEM_WEBHOOK_SECRET set')
}

const dashboardUrl = process.env.DASHBOARD_URL?.trim() || 'https://console.sanctumruntime.com'
ok(`DASHBOARD_URL: ${dashboardUrl}`)

let anyProduct = false
let allOk = true

for (const [secretName, planId] of products) {
  const productId = process.env[secretName]?.trim()
  if (!productId) {
    if (planId !== 'enterprise') warn(`${secretName} not set (optional for enterprise)`)
    continue
  }
  anyProduct = true

  const body = {
    product_id: productId,
    request_id: `verify-${planId}-${Date.now()}`,
    success_url: `${dashboardUrl.replace(/\/$/, '')}/?page=billing&checkout=success`,
    metadata: { org_id: 'verify-setup', plan_id: planId },
  }

  try {
    const res = await fetch(`${base}/v1/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await res.text()
    if (res.ok) {
      let url = ''
      try {
        const data = JSON.parse(text)
        url = data.checkout_url ?? data.checkoutUrl ?? ''
      } catch { /* ignore */ }
      ok(`${secretName} (${planId}) → checkout OK${url ? ` → ${url.slice(0, 60)}…` : ''}`)
    } else {
      allOk = false
      let detail = text.slice(0, 200)
      try {
        const parsed = JSON.parse(text)
        detail = JSON.stringify(parsed.message ?? parsed.error ?? parsed).slice(0, 200)
      } catch { /* plain text */ }
      fail(`${secretName} (${planId}) → HTTP ${res.status}: ${detail}`)
    }
  } catch (err) {
    allOk = false
    fail(`${secretName} (${planId}) → ${err instanceof Error ? err.message : String(err)}`)
  }
}

if (!anyProduct) {
  fail('No CREEM_PRODUCT_* IDs set — create test products in Creem and add IDs to .env')
}

console.log('')
if (allOk && anyProduct) {
  console.log('All configured products can create checkouts. Next:')
  console.log('  npm run creem:secrets && npm run creem:deploy')
  console.log('  Then upgrade from Billing in the console (test card 4242…).')
} else {
  console.log('Fix errors above, then re-run: npm run creem:verify-test')
  process.exitCode = 1
}
