/**
 * Full control-plane smoke test (production or local).
 *
 *   SANCTUM_API_URL=... SANCTUM_API_KEY=... SANCTUM_MEMORY_KEY=... \
 *   npm run smoke:control-plane
 */
const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY =
  process.env.SANCTUM_E2E_API_KEY?.trim() ||
  process.env.SANCTUM_API_KEY?.trim()
const MEMORY_KEY = process.env.SANCTUM_MEMORY_KEY?.trim()

if (!API || !KEY) {
  console.error('Set SANCTUM_API_URL and SANCTUM_API_KEY')
  process.exit(1)
}

const headers = { 'X-Sanctum-Key': KEY, 'Content-Type': 'application/json' }
let failed = 0

function ok(m) {
  console.log(`✓ ${m}`)
}
function bad(m, d) {
  failed++
  console.error(`✗ ${m}${d ? ` — ${d}` : ''}`)
}

async function j(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

async function main() {
  console.log(`Control-plane smoke → ${API}\n`)

  let orgId = process.env.SANCTUM_ORG_ID?.trim()
  if (!orgId) {
    const ctx = await j('GET', '/v1/operator/context')
    orgId = ctx.body?.defaultOrganizationId
  }
  if (!orgId) {
    bad('resolve org', 'set SANCTUM_ORG_ID')
    process.exit(1)
  }
  ok(`org ${orgId}`)

  const challenge = await j('GET', `/v1/attestation/challenge?org_id=${encodeURIComponent(orgId)}`)
  if (challenge.status !== 200) bad('attestation challenge', challenge.status)
  else ok('attestation challenge')

  const connect = await j('POST', '/v1/runtimes/connect', {
    runtimeName: `smoke-${Date.now()}`,
    organizationId: orgId,
    mode: 'cloud',
    region: 'smoke',
    attestation: {
      platform: 'smoke',
      hostname: 'ci',
      sdkVersion: '0.1.1',
      hardware: challenge.body
        ? {
            type: 'software-sealed',
            challengeId: challenge.body.challengeId,
            nonce: challenge.body.nonce,
            quote: challenge.body.softwareSealedQuote,
          }
        : undefined,
    },
  })
  if (connect.status !== 200) bad('connect', connect.status)
  else {
    ok(
      `connect trust=${connect.body?.trustScore} status=${connect.body?.attestationStatus} hw=${connect.body?.hardwareVerified}`,
    )
  }

  const runtimeId = connect.body?.runtimeId
  if (!runtimeId) {
    process.exit(1)
  }

  const agent = await j('POST', `/v1/runtimes/${runtimeId}/agents`, {
    id: 'smoke_agent',
    model: 'gpt-4o-mini',
  })
  if (agent.status === 200) ok('register agent')
  else bad('register agent', agent.status)

  const verify = await j('POST', '/v1/actions/verify', {
    actor: 'smoke_agent',
    action: 'read_calendar',
    context: { org_id: orgId, smoke: true },
    offlineMode: true,
  })
  if (verify.status === 200) ok(`verify ${verify.body?.decision}`)
  else bad('verify', verify.status)

  const packages = await j('GET', `/v1/marketplace/packages?org_id=${encodeURIComponent(orgId)}`)
  if (packages.status === 200 && Array.isArray(packages.body?.packages)) {
    ok(`marketplace ${packages.body.packages.length} packages`)
  } else bad('marketplace', packages.status)

  const map = await j('GET', `/v1/fleet/map?org_id=${encodeURIComponent(orgId)}`)
  if (map.status === 200) ok(`fleet map ${map.body?.summary?.runtimes ?? 0} runtimes`)
  else bad('fleet map', map.status)

  if (MEMORY_KEY && MEMORY_KEY.length >= 16) {
    const { createCipheriv, createHash, randomBytes, scryptSync } = await import('node:crypto')
    const key = scryptSync(MEMORY_KEY, `sanctum:${orgId}:smoke_agent`, 32)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update('{"ok":true}'), cipher.final()])
    const tag = cipher.getAuthTag()
    const packed = Buffer.concat([enc, tag]).toString('base64url')
    const mem = await j('PUT', `/v1/runtimes/${runtimeId}/agents/smoke_agent/memory/smoke_key`, {
      ciphertext: packed,
      iv: iv.toString('base64url'),
      algorithm: 'aes-256-gcm',
      keyHint: createHash('sha256').update(MEMORY_KEY).digest('hex').slice(0, 16),
    })
    if (mem.status === 200) ok('memory write')
    else bad('memory write', mem.status)
  } else {
    console.log('○ Set SANCTUM_MEMORY_KEY to test encrypted memory')
  }

  await j('POST', `/v1/runtimes/${runtimeId}/heartbeat`, { status: 'offline' })

  const usage = await j('GET', `/v1/usage?org_id=${encodeURIComponent(orgId)}&days=1`)
  if (usage.status === 200) {
    const n = Object.values(usage.body?.totals ?? {}).reduce((a, b) => a + Number(b), 0)
    ok(`usage recorded (${n} events in totals)`)
  } else bad('usage', usage.status)

  console.log('')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
