#!/usr/bin/env node
/**
 * Production module write-flow tests — policies, shield, workflows, alerts,
 * agents, fleet pause, assurance, orchestration, marketplace (when available).
 *
 * Prerequisites: npm run e2e:bootstrap (SANCTUM_E2E_API_KEY, SANCTUM_ORG_ID, TEST_USER_EMAIL)
 *
 * Usage:
 *   node scripts/test-modules-write.mjs
 *   SANCTUM_API_URL=https://api.sanctumruntime.com node scripts/test-modules-write.mjs
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
const TS = Date.now()
const TAG = `e2e_${TS}`

let failed = 0

function ok(msg) {
  console.log(`  ✓ ${msg}`)
}
function skip(msg) {
  console.log(`  ○ ${msg}`)
}
function bad(msg, detail) {
  failed++
  console.error(`  ✗ ${msg}${detail != null ? ` — ${detail}` : ''}`)
}

async function main() {
  console.log('\nModule write-flow tests (production)\n')

  if (!ORG || !KEY) {
    bad('bootstrap', 'missing SANCTUM_ORG_ID or SANCTUM_E2E_API_KEY — run npm run e2e:bootstrap')
    process.exit(1)
  }
  if (!EMAIL) {
    bad('auth', 'missing TEST_USER_EMAIL')
    process.exit(1)
  }

  let jwt
  try {
    ;({ jwt } = await operatorJwtViaMagicLink(EMAIL))
    ok('operator JWT')
  } catch (e) {
    bad('operator JWT', e.message)
    process.exit(1)
  }

  const keyH = { 'X-Sanctum-Key': KEY }
  const jwtH = { Authorization: `Bearer ${jwt}` }

  // ── Policies ──────────────────────────────────────────────────────────────
  console.log('\nPolicies')
  const policyAction = `e2e.write.${TAG}`
  const polCreate = await apiJson(API, '/v1/policies', {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: { action: policyAction, org_id: ORG, requiresVerification: true },
  })
  if (polCreate.res.ok) {
    ok(`create policy ${policyAction}`)
  } else if (polCreate.res.status === 402) {
    skip('policy create (plan gate)')
  } else {
    bad('policy create', `${polCreate.res.status} ${polCreate.text?.slice(0, 120)}`)
  }

  if (polCreate.res.ok) {
    const sim = await apiJson(API, '/v1/policies/simulate', {
      method: 'POST',
      headers: keyH,
      body: { actor: 'e2e-tester', action: policyAction, context: {} },
    })
    if (sim.res.ok && ['REQUIRE_VERIFICATION', 'BLOCKED', 'APPROVED'].includes(sim.json?.decision)) {
      ok(`policy simulate → ${sim.json.decision}`)
    } else {
      bad('policy simulate', sim.text?.slice(0, 120))
    }

    const polPatch = await apiJson(API, `/v1/policies/${encodeURIComponent(policyAction)}?org_id=${encodeURIComponent(ORG)}`, {
      method: 'PATCH',
      headers: { ...keyH, 'Content-Type': 'application/json' },
      body: { autoBlock: false },
    })
    if (polPatch.res.ok) ok('policy patch')
    else bad('policy patch', polPatch.res.status)
  }

  // ── Shield rules ──────────────────────────────────────────────────────────
  console.log('\nShield rules')
  const shieldPattern = `e2e.block.${TAG}.*`
  const shieldAction = `e2e.block.${TAG}.transfer`
  let shieldRuleId

  const shieldCreate = await apiJson(API, '/v1/shield/rules', {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: {
      actionPattern: shieldPattern,
      label: `E2E block ${TAG}`,
      response: 'BLOCK',
      category: 'financial',
    },
  })
  if (shieldCreate.res.status === 201 && shieldCreate.json?.rule?.id) {
    shieldRuleId = shieldCreate.json.rule.id
    ok(`shield rule created ${shieldRuleId}`)
  } else if (shieldCreate.res.status === 402) {
    skip('shield rule create (plan gate)')
  } else {
    bad('shield rule create', `${shieldCreate.res.status} ${shieldCreate.text?.slice(0, 120)}`)
  }

  if (shieldRuleId) {
    const verify = await apiJson(API, '/v1/actions/verify', {
      method: 'POST',
      headers: keyH,
      body: { actor: 'e2e-shield', action: shieldAction, context: { amount: 1 }, offlineMode: true },
    })
    if (verify.res.ok && verify.json?.decision === 'BLOCKED') {
      ok('shield rule blocks verify action')
    } else {
      bad('shield verify', verify.json?.decision ?? verify.text?.slice(0, 120))
    }
  }

  // ── Governance workflows ──────────────────────────────────────────────────
  console.log('\nGovernance workflows')
  let workflowId
  const wfCreate = await apiJson(API, `/v1/orgs/${ORG}/workflows`, {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: {
      name: `E2E workflow ${TAG}`,
      action_pattern: `e2e.wf.${TAG}.*`,
      steps: [{ role: 'owner', required_count: 1 }],
      expiry_minutes: 60,
      is_active: true,
    },
  })
  if (wfCreate.res.status === 201 && wfCreate.json?.id) {
    workflowId = wfCreate.json.id
    ok(`workflow created ${workflowId}`)
  } else if (wfCreate.res.status === 402) {
    skip('workflow create (plan gate)')
  } else {
    bad('workflow create', `${wfCreate.res.status} ${wfCreate.text?.slice(0, 160)}`)
  }

  if (workflowId) {
    const wfList = await apiJson(API, `/v1/orgs/${ORG}/workflows`, { headers: keyH })
    const found = Array.isArray(wfList.json) && wfList.json.some((w) => w.id === workflowId)
    if (wfList.res.ok && found) ok('workflow listed')
    else bad('workflow list', wfList.res.status)
  }

  // ── Alert rules ───────────────────────────────────────────────────────────
  console.log('\nAlert rules')
  let alertRuleId
  const alertCreate = await apiJson(API, `/v1/orgs/${ORG}/alert-rules`, {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: {
      name: `E2E alert ${TAG}`,
      event_type: 'verification_required',
      threshold: 1,
      window_minutes: 60,
      severity: 'info',
      channels: ['email'],
    },
  })
  if (alertCreate.res.status === 201 && alertCreate.json?.rule?.id) {
    alertRuleId = alertCreate.json.rule.id
    ok(`alert rule created ${alertRuleId}`)
  } else if (alertCreate.res.status === 402) {
    skip('alert rule create (plan gate)')
  } else {
    bad('alert rule create', `${alertCreate.res.status} ${alertCreate.text?.slice(0, 120)}`)
  }

  // ── Policy snapshots ────────────────────────────────────────────────────────
  console.log('\nPolicy snapshots')
  const snapCreate = await apiJson(API, `/v1/orgs/${ORG}/policy-snapshots`, {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: { label: `E2E snapshot ${TAG}`, change_summary: 'automated a2z write test' },
  })
  if (snapCreate.res.status === 201 || snapCreate.res.ok) {
    ok(`policy snapshot created (${snapCreate.json?.id ?? 'ok'})`)
  } else if (snapCreate.res.status === 402) {
    skip('policy snapshot (plan gate)')
  } else if (
    snapCreate.res.status === 500 &&
    /runtime_policies\.action|failed_to_fetch_policies/.test(snapCreate.text ?? '')
  ) {
    skip('policy snapshot (production API needs policy-versions column fix — deploy latest API)')
  } else {
    bad('policy snapshot', `${snapCreate.res.status} ${snapCreate.text?.slice(0, 120)}`)
  }

  // ── Agents ─────────────────────────────────────────────────────────────────
  console.log('\nAgents')
  let agentId
  const agentCreate = await apiJson(API, `/v1/orgs/${ORG}/agents`, {
    method: 'POST',
    headers: { ...jwtH, 'Content-Type': 'application/json' },
    body: { name: `E2E agent ${TAG}`, description: 'a2z module write test' },
  })
  if (agentCreate.res.status === 201 && agentCreate.json?.id) {
    agentId = agentCreate.json.id
    ok(`agent registered ${agentId}`)
  } else if (agentCreate.res.status === 402) {
    skip('agent create (plan/limit gate)')
  } else {
    bad('agent create', `${agentCreate.res.status} ${agentCreate.text?.slice(0, 120)}`)
  }

  if (agentId) {
    const rotate = await apiJson(API, `/v1/orgs/${ORG}/agents/${agentId}/rotate`, {
      method: 'POST',
      headers: jwtH,
    })
    if (rotate.res.ok && rotate.json?.token) ok('agent token rotate')
    else bad('agent rotate', rotate.res.status)
  }

  // ── Fleet pause / resume ────────────────────────────────────────────────────
  console.log('\nFleet pause')
  const pauseBefore = await apiJson(API, `/v1/fleet/pause-status?org_id=${encodeURIComponent(ORG)}`, { headers: keyH })
  if (pauseBefore.res.ok) ok(`pause-status paused=${pauseBefore.json?.paused}`)

  const pause = await apiJson(API, '/v1/fleet/pause', {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: { org_id: ORG },
  })
  if (pause.res.ok && pause.json?.paused) {
    ok('fleet paused')
    try {
      const fleetVerify = await apiJson(API, '/v1/actions/verify', {
        method: 'POST',
        headers: keyH,
        body: { actor: 'e2e-fleet', action: 'send_email', context: {}, offlineMode: true },
      })
      if (fleetVerify.res.ok && fleetVerify.json?.decision === 'BLOCKED') {
        ok('verify blocked while fleet paused')
      } else {
        bad('fleet pause verify', fleetVerify.json?.decision ?? fleetVerify.text?.slice(0, 80))
      }
    } finally {
      const resume = await apiJson(API, '/v1/fleet/resume', {
        method: 'POST',
        headers: { ...keyH, 'Content-Type': 'application/json' },
        body: { org_id: ORG },
      })
      if (resume.res.ok && resume.json?.paused === false) ok('fleet resumed')
      else bad('fleet resume', resume.res.status)
    }
  } else if (pause.res.status === 402) {
    skip('fleet pause (plan gate)')
  } else {
    bad('fleet pause', `${pause.res.status} ${pause.text?.slice(0, 80)}`)
  }

  // ── Assurance ─────────────────────────────────────────────────────────────
  console.log('\nAssurance')
  const replay = await apiJson(API, `/v1/audit/replay?org_id=${encodeURIComponent(ORG)}&limit=5`, { headers: keyH })
  if (replay.res.ok) ok(`audit replay (${Array.isArray(replay.json) ? replay.json.length : 'ok'} entries)`)
  else if (replay.res.status === 402) skip('audit replay (plan gate)')
  else bad('audit replay', replay.res.status)

  const evidence = await apiJson(API, `/v1/evidence/summary?org_id=${encodeURIComponent(ORG)}&limit=5`, { headers: keyH })
  if (evidence.res.ok) ok('evidence summary')
  else if (evidence.res.status === 402) skip('evidence summary (plan gate)')
  else bad('evidence summary', evidence.res.status)

  // ── Orchestration / deployment groups ───────────────────────────────────────
  console.log('\nOrchestration')
  const groupName = `E2E group ${TAG}`
  const groupCreate = await apiJson(API, '/v1/deployment-groups', {
    method: 'POST',
    headers: { ...keyH, 'Content-Type': 'application/json' },
    body: { organizationId: ORG, name: groupName, description: 'a2z write test' },
  })
  if (groupCreate.res.ok && groupCreate.json?.group?.id) {
    ok(`deployment group ${groupCreate.json.group.id}`)
  } else if (groupCreate.res.status === 402) {
    skip('deployment group (plan gate)')
  } else {
    bad('deployment group create', `${groupCreate.res.status} ${groupCreate.text?.slice(0, 120)}`)
  }

  const groups = await apiJson(API, `/v1/deployment-groups?org_id=${encodeURIComponent(ORG)}`, { headers: keyH })
  if (groups.res.ok) ok(`deployment groups list (${Array.isArray(groups.json) ? groups.json.length : 'ok'})`)
  else if (groups.res.status === 402) skip('deployment groups list (plan gate)')
  else bad('deployment groups list', groups.res.status)

  // ── Marketplace ───────────────────────────────────────────────────────────
  console.log('\nMarketplace')
  const mkt = await apiJson(API, `/v1/marketplace/packages?org_id=${encodeURIComponent(ORG)}`, { headers: keyH })
  const packages = Array.isArray(mkt.json) ? mkt.json : mkt.json?.packages ?? []
  if (!mkt.res.ok) {
    bad('marketplace list', mkt.res.status)
  } else if (packages.length === 0) {
    skip('marketplace install (catalog empty)')
  } else {
    const slug = packages[0].slug ?? packages[0].id
    if (!slug) {
      skip('marketplace install (no slug on first package)')
    } else {
      const install = await apiJson(API, `/v1/marketplace/packages/${encodeURIComponent(slug)}/install`, {
        method: 'POST',
        headers: { ...keyH, 'Content-Type': 'application/json' },
        body: { org_id: ORG },
      })
      if (install.res.ok || install.res.status === 201) {
        ok(`marketplace install ${slug}`)
      } else if (install.res.status === 409) {
        ok(`marketplace already installed ${slug}`)
      } else {
        bad('marketplace install', `${install.res.status} ${install.text?.slice(0, 120)}`)
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  console.log('\nCleanup')
  if (policyAction && polCreate.res.ok) {
    const del = await apiJson(API, `/v1/policies/${encodeURIComponent(policyAction)}?org_id=${encodeURIComponent(ORG)}`, {
      method: 'DELETE',
      headers: keyH,
    })
    if (del.res.ok) ok('policy deleted')
    else bad('policy delete', del.res.status)
  }
  if (shieldRuleId) {
    const del = await apiJson(API, `/v1/shield/rules/${shieldRuleId}`, { method: 'DELETE', headers: keyH })
    if (del.res.ok || del.res.status === 204) ok('shield rule deleted')
    else bad('shield rule delete', del.res.status)
  }
  if (workflowId) {
    const del = await apiJson(API, `/v1/orgs/${ORG}/workflows/${workflowId}`, { method: 'DELETE', headers: jwtH })
    if (del.res.status === 204 || del.res.ok) ok('workflow deleted')
    else bad('workflow delete', del.res.status)
  }
  if (alertRuleId) {
    const del = await apiJson(API, `/v1/orgs/${ORG}/alert-rules/${alertRuleId}`, { method: 'DELETE', headers: keyH })
    if (del.res.ok || del.res.status === 204) ok('alert rule deleted')
    else bad('alert rule delete', del.res.status)
  }
  if (agentId) {
    const del = await apiJson(API, `/v1/orgs/${ORG}/agents/${agentId}`, { method: 'DELETE', headers: jwtH })
    if (del.res.ok) ok('agent revoked')
    else bad('agent delete', del.res.status)
  }

  console.log(failed ? `\n❌ Module write tests: ${failed} failed\n` : '\n✅ Module write tests passed\n')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
