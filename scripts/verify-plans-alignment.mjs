#!/usr/bin/env node
/**
 * Compare public.plans (DB) vs PLAN_DEFAULTS (API code) and print a pass/fail matrix.
 *
 *   node scripts/verify-plans-alignment.mjs
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(root, '.env') })

const TIERS = ['observer', 'personal', 'operator', 'team', 'enterprise']

/** Mirrors apps/api/src/entitlements.ts PLAN_DEFAULTS */
const CODE = {
  observer: {
    price: null,
    runtimes: 3,
    governed: 50,
    observe: null,
    agents: 2,
    retention: 7,
    features: ['connect', 'live_feed', 'observe_mode', 'basic_dashboard', 'community_support'],
  },
  personal: {
    price: 12,
    runtimes: 5,
    governed: 500,
    observe: null,
    agents: 5,
    retention: 30,
    features: ['connect', 'live_feed', 'observe_mode', 'light_gates', 'weekly_digest', 'basic_dashboard', 'email_alerts'],
  },
  operator: {
    price: 59,
    runtimes: 25,
    governed: 500_000,
    observe: null,
    agents: 10,
    retention: 30,
    features: [
      'connect', 'live_feed', 'shield_rules', 'webhooks', 'live_telemetry', 'runtime_health',
      'api_access', 'alerts', 'cloud_sync', 'holds_approve',
    ],
  },
  team: {
    price: 299,
    runtimes: 250,
    governed: 10_000_000,
    observe: null,
    agents: 50,
    retention: 30,
    features: [
      'connect', 'live_feed', 'shield_rules', 'sso', 'rbac', 'alerts', 'audit_logs',
      'advanced_fleet', 'webhooks', 'compliance_export',
    ],
  },
  enterprise: {
    price: null,
    runtimes: null,
    governed: null,
    observe: null,
    agents: null,
    retention: 90,
    features: ['everything', 'air_gap', 'private_cloud', 'sla', 'dedicated_support', 'compliance', 'encrypted_memory'],
  },
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  return Number(v)
}

function featSet(arr) {
  return [...(arr ?? [])].sort().join(',')
}

function compare(tier, row) {
  const c = CODE[tier]
  if (!row) return [`${tier}: missing in DB`]
  const issues = []
  const price = num(row.price_monthly_usd)
  if (price !== c.price) issues.push(`price ${price} != ${c.price}`)
  if (num(row.max_runtimes) !== c.runtimes) issues.push(`runtimes ${row.max_runtimes} != ${c.runtimes}`)
  if (num(row.max_governed_actions_per_month) !== c.governed) {
    issues.push(`governed ${row.max_governed_actions_per_month} != ${c.governed}`)
  }
  if (num(row.max_observe_events_per_month) !== c.observe) {
    issues.push(`observe ${row.max_observe_events_per_month} != ${c.observe}`)
  }
  if (num(row.max_agents) !== c.agents) issues.push(`agents ${row.max_agents} != ${c.agents}`)
  if (Number(row.retention_days) !== c.retention) issues.push(`retention ${row.retention_days} != ${c.retention}`)
  const dbFeat = featSet(row.features)
  const codeFeat = featSet(c.features)
  if (dbFeat !== codeFeat) issues.push(`features mismatch`)
  return issues
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.error('Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: rows, error } = await admin.from('plans').select('*').in('id', TIERS)
  if (error) {
    console.error('plans query failed:', error.message)
    process.exit(1)
  }

  const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]))
  let failed = 0

  console.log('\n=== Plan alignment: DB public.plans vs API PLAN_DEFAULTS ===\n')
  for (const tier of TIERS) {
    const issues = compare(tier, byId[tier])
    if (issues.length === 0) {
      console.log(`  OK  ${tier}`)
    } else {
      failed += 1
      console.log(`  FAIL ${tier}: ${issues.join('; ')}`)
    }
  }

  const { count: orgPlans } = await admin
    .from('org_plans')
    .select('*', { count: 'exact', head: true })
  const { count: orgs } = await admin.from('organizations').select('*', { count: 'exact', head: true })

  console.log('\n=== Runtime state ===')
  console.log(`  organizations: ${orgs ?? 0}`)
  console.log(`  org_plans:     ${orgPlans ?? 0}`)
  if ((orgs ?? 0) > 0 && (orgPlans ?? 0) < (orgs ?? 0)) {
    console.log('  WARN: some orgs lack org_plans (API ensureOrgPlan will backfill on first request)')
    failed += 1
  }

  const creem = {
    personal: process.env.CREEM_PRODUCT_PERSONAL?.trim(),
    operator: process.env.CREEM_PRODUCT_OPERATOR?.trim(),
    team: process.env.CREEM_PRODUCT_TEAM?.trim(),
  }
  console.log('\n=== Creem env (local .env — set same on Render sanctum-api) ===')
  for (const [plan, id] of Object.entries(creem)) {
    console.log(`  ${plan}: ${id ? id : 'MISSING'}`)
    if (!id) failed += 1
  }
  console.log(`  CREEM_API_KEY: ${process.env.CREEM_API_KEY?.trim() ? 'set' : 'MISSING'}`)
  console.log(`  CREEM_WEBHOOK_SECRET: ${process.env.CREEM_WEBHOOK_SECRET?.trim() ? 'set' : 'MISSING'}`)

  console.log(failed === 0 ? '\nAll checks passed.\n' : `\n${failed} check group(s) need attention.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
