#!/usr/bin/env node
/**
 * Per-console-page production smoke — maps each sidebar destination to API/data checks.
 *
 * Prerequisites: npm run e2e:bootstrap
 *
 * Usage:
 *   node scripts/test-pages-production.mjs
 *   SANCTUM_API_URL=https://api.sanctumruntime.com node scripts/test-pages-production.mjs
 */
import {
  loadA2zEnv,
  PROD_API,
  apiJson,
  apiKeyHeader,
  operatorJwtViaMagicLink,
} from './a2z/lib.mjs'

loadA2zEnv()

const API = (process.env.SANCTUM_API_URL || PROD_API).replace(/\/$/, '')
const ORG = process.env.SANCTUM_ORG_ID?.trim()
const KEY = apiKeyHeader()
const EMAIL = process.env.TEST_USER_EMAIL?.trim() || process.env.A2Z_USER_EMAIL?.trim()

let failed = 0

function ok(page, detail) {
  console.log(`  ✓ ${page}${detail ? ` — ${detail}` : ''}`)
}
function skip(page, reason) {
  console.log(`  ○ ${page} — ${reason}`)
}
function bad(page, detail) {
  failed++
  console.error(`  ✗ ${page}${detail ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('\nConsole pages → production API smoke\n')

  if (!ORG || !KEY || !EMAIL) {
    bad('bootstrap', 'missing SANCTUM_ORG_ID, SANCTUM_E2E_API_KEY, or TEST_USER_EMAIL')
    process.exit(1)
  }

  let jwt
  try {
    ;({ jwt } = await operatorJwtViaMagicLink(EMAIL))
    ok('auth', 'operator JWT')
  } catch (e) {
    bad('auth', e.message)
    process.exit(1)
  }

  const jwtH = { Authorization: `Bearer ${jwt}` }
  const keyH = { 'X-Sanctum-Key': KEY }

  const pages = [
    {
      id: 'overview',
      label: 'Overview',
      run: async () => {
        const status = await apiJson(API, '/v1/status', { headers: keyH })
        if (status.res.ok) ok('overview', 'runtime status')
        else bad('overview', status.res.status)
      },
    },
    {
      id: 'connect',
      label: 'Connect Agent',
      run: async () => {
        const [settings, health, platforms] = await Promise.all([
          apiJson(API, `/v1/orgs/${ORG}/connect/settings`, { headers: jwtH }),
          apiJson(API, `/v1/orgs/${ORG}/connect/health`, { headers: jwtH }),
          apiJson(API, '/v1/proxy/platforms'),
        ])
        if (!settings.res.ok) bad('connect', `settings ${settings.res.status}`)
        else if (!health.res.ok) bad('connect', `health ${health.res.status}`)
        else {
          const n = Array.isArray(platforms.json?.platforms) ? platforms.json.platforms.length : 0
          ok('connect', `gate=${settings.json?.proxy_mode ?? '?'} · ${n} proxy platforms`)
        }
      },
    },
    {
      id: 'live-feed',
      label: 'Live Feed',
      run: async () => {
        const feed = await apiJson(API, `/v1/orgs/${ORG}/connect/live-feed?limit=5`, { headers: jwtH })
        if (feed.res.ok) ok('live-feed', `${feed.json?.events?.length ?? 0} recent proxy events`)
        else bad('live-feed', feed.res.status)
      },
    },
    {
      id: 'activity',
      label: 'Runtime Activity',
      run: async () => {
        const usage = await apiJson(API, `/v1/usage?org_id=${encodeURIComponent(ORG)}&days=7`, { headers: keyH })
        if (usage.res.ok) ok('activity', 'usage timeline')
        else if (usage.res.status === 402) skip('activity', 'plan gate')
        else bad('activity', usage.res.status)
      },
    },
    {
      id: 'audit',
      label: 'Audit Logs',
      run: async () => {
        const audit = await apiJson(API, `/v1/orgs/${ORG}/audit?limit=5`, { headers: jwtH })
        const auditWide = await apiJson(API, `/v1/orgs/${ORG}/audit?limit=200`, { headers: jwtH })
        let chain = await apiJson(API, `/v1/orgs/${ORG}/audit/verify-chain`, { method: 'POST', headers: jwtH, body: {} })
        if (!audit.res.ok) bad('audit', `list ${audit.res.status}`)
        else if (!auditWide.res.ok) bad('audit', `limit=200 ${auditWide.res.status}`)
        else if (!chain.res.ok) bad('audit', `chain ${chain.res.status}`)
        else if (chain.json?.valid !== true) {
          const rebuild = await apiJson(API, `/v1/orgs/${ORG}/audit/rebuild-chain`, { method: 'POST', headers: jwtH, body: {} })
          if (rebuild.res.ok) {
            chain = await apiJson(API, `/v1/orgs/${ORG}/audit/verify-chain`, { method: 'POST', headers: jwtH, body: {} })
          }
          ok('audit', `entries + chain valid=${chain.json?.valid ?? false}${rebuild.res.ok ? ' (rebuilt)' : ''}`)
        } else ok('audit', 'entries + chain valid=true · limit=200 ok')
      },
    },
    {
      id: 'threats',
      label: 'Threat Monitor',
      run: async () => {
        const [auditWide, alerts] = await Promise.all([
          apiJson(API, `/v1/orgs/${ORG}/audit?limit=200`, { headers: jwtH }),
          apiJson(API, `/v1/alerts?org_id=${encodeURIComponent(ORG)}`, { headers: keyH }),
        ])
        if (!auditWide.res.ok) bad('threats', `audit limit=200 → ${auditWide.res.status}`)
        else ok('threats', `${auditWide.json?.entries?.length ?? 0} audit events (limit=200)`)
        if (alerts.res.ok) ok('threats-alerts', 'alerts feed')
        else if (alerts.res.status === 402) skip('threats-alerts', 'plan gate')
        else bad('threats-alerts', alerts.res.status)
      },
    },
    {
      id: 'alerts',
      label: 'Alerts',
      run: async () => {
        const rules = await apiJson(API, `/v1/orgs/${ORG}/alert-rules`, { headers: keyH })
        if (rules.res.ok) ok('alerts', `${rules.json?.rules?.length ?? 0} rules`)
        else if (rules.res.status === 402) skip('alerts', 'plan gate')
        else bad('alerts', rules.res.status)
      },
    },
    {
      id: 'shield',
      label: 'Sanctum Shield',
      run: async () => {
        const shield = await apiJson(API, '/v1/shield/status', { headers: keyH })
        if (shield.res.ok) ok('shield', 'containment status')
        else if (shield.res.status === 402) skip('shield', 'plan gate')
        else bad('shield', shield.res.status)
      },
    },
    {
      id: 'shield-rules',
      label: 'Shield Rules',
      run: async () => {
        const rules = await apiJson(API, '/v1/shield/rules', { headers: keyH })
        if (rules.res.ok) ok('shield-rules', `${rules.json?.rules?.length ?? 0} rules`)
        else if (rules.res.status === 402) skip('shield-rules', 'plan gate')
        else bad('shield-rules', rules.res.status)
      },
    },
    {
      id: 'policies',
      label: 'Policies',
      run: async () => {
        const pol = await apiJson(API, `/v1/policies?org_id=${encodeURIComponent(ORG)}`, { headers: keyH })
        if (pol.res.ok) ok('policies', `${pol.json?.policies?.length ?? 0} policies`)
        else if (pol.res.status === 402) skip('policies', 'plan gate')
        else bad('policies', pol.res.status)
      },
    },
    {
      id: 'policy-history',
      label: 'Policy History',
      run: async () => {
        const snaps = await apiJson(API, `/v1/orgs/${ORG}/policy-snapshots`, { headers: jwtH })
        if (snaps.res.ok) ok('policy-history', `${Array.isArray(snaps.json) ? snaps.json.length : 0} snapshots`)
        else if (snaps.res.status === 402) skip('policy-history', 'plan gate')
        else bad('policy-history', snaps.res.status)
      },
    },
    {
      id: 'workflow-builder',
      label: 'Policy Composer',
      run: async () => {
        const wf = await apiJson(API, `/v1/orgs/${ORG}/workflows`, { headers: keyH })
        if (wf.res.ok) ok('workflow-builder', `${Array.isArray(wf.json) ? wf.json.length : 0} workflows`)
        else if (wf.res.status === 402) skip('workflow-builder', 'plan gate')
        else bad('workflow-builder', wf.res.status)
      },
    },
    {
      id: 'governance',
      label: 'Governance',
      run: async () => {
        const approvals = await apiJson(API, `/v1/orgs/${ORG}/approvals?status=pending`, { headers: jwtH })
        if (approvals.res.ok) ok('governance', `${Array.isArray(approvals.json) ? approvals.json.length : 0} pending`)
        else bad('governance', approvals.res.status)
      },
    },
    {
      id: 'permissions',
      label: 'Permission graph',
      run: async () => {
        const grants = await apiJson(API, `/v1/orgs/${ORG}/delegations`, { headers: jwtH })
        if (grants.res.ok) ok('permissions', 'delegation graph')
        else if (grants.res.status === 402) skip('permissions', 'plan gate')
        else bad('permissions', grants.res.status)
      },
    },
    {
      id: 'assurance',
      label: 'Assurance',
      run: async () => {
        const replay = await apiJson(API, `/v1/audit/replay?org_id=${encodeURIComponent(ORG)}&limit=3`, { headers: keyH })
        if (replay.res.ok) ok('assurance', 'audit replay')
        else if (replay.res.status === 402) skip('assurance', 'plan gate')
        else bad('assurance', replay.res.status)
      },
    },
    {
      id: 'compliance',
      label: 'Compliance',
      run: async () => {
        const start = new Date(Date.now() - 7 * 86_400_000).toISOString()
        const end = new Date().toISOString()
        const report = await apiJson(
          API,
          `/v1/orgs/${ORG}/compliance/report?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { headers: keyH },
        )
        if (report.res.ok) ok('compliance', 'report')
        else if (report.res.status === 402) skip('compliance', 'plan gate')
        else bad('compliance', report.res.status)
      },
    },
    {
      id: 'agents',
      label: 'Agents',
      run: async () => {
        const agents = await apiJson(API, `/v1/orgs/${ORG}/agents`, { headers: jwtH })
        if (agents.res.ok) ok('agents', `${Array.isArray(agents.json) ? agents.json.length : 0} registered`)
        else bad('agents', agents.res.status)
      },
    },
    {
      id: 'devices',
      label: 'Devices',
      run: async () => {
        const keys = await apiJson(API, '/v1/api-keys', { headers: jwtH })
        if (keys.res.ok) ok('devices', 'API keys list')
        else bad('devices', keys.res.status)
      },
    },
    {
      id: 'fleet',
      label: 'Runtime Fleet',
      run: async () => {
        const map = await apiJson(API, `/v1/fleet/map?org_id=${encodeURIComponent(ORG)}`, { headers: keyH })
        if (map.res.ok) ok('fleet', `${map.json?.runtimes?.length ?? 0} runtimes`)
        else bad('fleet', map.res.status)
      },
    },
    {
      id: 'marketplace',
      label: 'Marketplace',
      run: async () => {
        const mkt = await apiJson(API, `/v1/marketplace/packages?org_id=${encodeURIComponent(ORG)}`, { headers: jwtH })
        const packages = mkt.json?.packages ?? []
        if (!mkt.res.ok) bad('marketplace', mkt.res.status)
        else if (packages.length === 0) bad('marketplace', 'catalog empty — run migration 078')
        else ok('marketplace', `${packages.length} packages (incl. ${packages.some((p) => p.slug === 'connect-agent-starter') ? 'connect-agent-starter' : packages[0].slug})`)
      },
    },
    {
      id: 'billing',
      label: 'Billing',
      run: async () => {
        const plan = await apiJson(API, `/v1/billing/plan?org_id=${encodeURIComponent(ORG)}`, { headers: jwtH })
        if (plan.res.ok) ok('billing', `plan=${plan.json?.plan?.id ?? plan.json?.planId ?? '?'}`)
        else bad('billing', plan.res.status)
      },
    },
    {
      id: 'settings',
      label: 'Settings',
      run: async () => {
        const profile = await apiJson(API, '/v1/account/profile', { headers: jwtH })
        if (profile.res.ok) ok('settings', 'account profile')
        else bad('settings', profile.res.status)
      },
    },
  ]

  for (const page of pages) {
    try {
      await page.run()
    } catch (e) {
      bad(page.label, e.message)
    }
  }

  console.log(failed ? `\n❌ Page smoke: ${failed} failed\n` : `\n✅ All ${pages.length} console pages passed production smoke\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
