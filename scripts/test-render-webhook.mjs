/**
 * Test webhooks on a deployed API (Render). Requires:
 *   SANCTUM_API_URL, SANCTUM_API_KEY
 *   WEBHOOK_UUID — webhook.site inbox id (view at https://webhook.site/#!/<uuid>)
 */
import { createHmac } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

const API = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const KEY = process.env.SANCTUM_API_KEY?.trim()
const WEBHOOK_UUID = process.env.WEBHOOK_UUID?.trim()
const WEBHOOK_SECRET = process.env.SANCTUM_WEBHOOK_SECRET?.trim()

if (!API || !KEY) {
  console.error('Set SANCTUM_API_URL and SANCTUM_API_KEY')
  process.exit(1)
}
if (!WEBHOOK_UUID) {
  console.error('Set WEBHOOK_UUID (webhook.site inbox id)')
  process.exit(1)
}

const headers = (json = true) => {
  const h = { 'X-Sanctum-Key': KEY }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function api(path, init) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { ...headers(init?.body != null), ...init?.headers } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

async function pollEvents(expected, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  const found = new Map()
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://webhook.site/token/${WEBHOOK_UUID}/requests?sorting=newest&per_page=30`,
    )
    const { data } = await res.json()
    for (const req of data ?? []) {
      try {
        const body = JSON.parse(req.content)
        if (!body?.event) continue
        found.set(body.event, body)
        if (WEBHOOK_SECRET) {
          const sig =
            req.headers?.['x-sanctum-signature']?.[0] ??
            req.headers?.['X-Sanctum-Signature']?.[0]
          const json = JSON.stringify(body)
          const want = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(json).digest('hex')}`
          if (sig === want) found.set('hmac_ok', body)
        }
      } catch {
        /* skip */
      }
    }
    if (expected.every((e) => found.has(e))) return found
    await sleep(2000)
  }
  return found
}

let failed = 0
function ok(m) {
  console.log(`✓ ${m}`)
}
function bad(m, d) {
  failed++
  console.error(`✗ ${m}${d ? ` — ${d}` : ''}`)
}

async function main() {
  console.log(`Webhook test → ${API}\n`)

  const status = await api('/v1/webhooks/status')
  if (!status.configured) {
    console.error(
      'Webhooks not configured on Render. Add SANCTUM_WEBHOOK_URL (+ optional SECRET), save, redeploy.',
    )
    process.exit(1)
  }
  ok(`webhooks configured (urls=${status.urlCount}, events=${status.events.join(', ')})`)

  const blockAction = `webhook_block_${Date.now()}`

  const pending = await api('/v1/actions/verify', {
    method: 'POST',
    body: JSON.stringify({
      actor: 'webhook-test',
      action: 'unlock_door',
      context: { owner_sleeping: true },
      offlineMode: true,
      correlationId: `wh-${Date.now()}`,
    }),
  })
  if (pending.decision !== 'REQUIRE_VERIFICATION') {
    bad('verify', pending.decision)
  } else {
    ok('triggered verification.required')
  }

  let found = await pollEvents(['verification.required'])
  if (found.has('verification.required')) ok('received verification.required')
  else bad('verification.required', 'timeout')

  if (WEBHOOK_SECRET) {
    if (found.has('hmac_ok')) ok('HMAC signature valid')
    else bad('HMAC', 'missing or invalid X-Sanctum-Signature')
  }

  await api(`/v1/audit/${pending.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'APPROVED', resolvedBy: 'webhook-test' }),
  })
  ok('resolved audit entry')

  found = await pollEvents(['verification.required', 'verification.resolved'])
  if (found.has('verification.resolved')) ok('received verification.resolved')
  else bad('verification.resolved', 'timeout')

  await api('/v1/policies', {
    method: 'POST',
    body: JSON.stringify({ action: blockAction, autoBlock: true, requiresVerification: false }),
  })
  const blocked = await api('/v1/actions/verify', {
    method: 'POST',
    body: JSON.stringify({
      actor: 'webhook-test',
      action: blockAction,
      context: {},
      offlineMode: true,
    }),
  })
  if (blocked.decision === 'BLOCKED') ok('triggered action.blocked')
  else bad('block', blocked.decision)

  found = await pollEvents(['verification.required', 'verification.resolved', 'action.blocked'])
  if (found.has('action.blocked')) ok('received action.blocked')
  else bad('action.blocked', 'timeout')

  await api(`/v1/policies/${blockAction}`, { method: 'DELETE' })

  console.log(`\nView inbox: https://webhook.site/#!/${WEBHOOK_UUID}`)
  console.log(failed ? `\n${failed} failed` : '\nAll webhook events delivered')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
