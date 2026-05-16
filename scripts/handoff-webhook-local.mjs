/**
 * Local webhook E2E — proves dispatch + HMAC without Render env changes.
 * Spins up API briefly with SANCTUM_WEBHOOK_URL → webhook.site.
 */
import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'

const WEBHOOK_SECRET = 'handoff-local-webhook-secret'
let webhookUuid = process.env.WEBHOOK_UUID?.trim()

async function createWebhookSite() {
  const res = await fetch('https://webhook.site/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`webhook.site create → ${res.status}`)
  const data = await res.json()
  return data.uuid
}

async function pollEvents(uuid, expected, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  const found = new Set()
  while (Date.now() < deadline) {
    const res = await fetch(
      `https://webhook.site/token/${uuid}/requests?sorting=newest&per_page=20`,
    )
    const { data } = await res.json()
    for (const req of data ?? []) {
      try {
        const body = JSON.parse(req.content)
        if (body?.event) {
          found.add(body.event)
          if (WEBHOOK_SECRET && req.headers) {
            const sigHeader =
              req.headers['x-sanctum-signature']?.[0] ??
              req.headers['X-Sanctum-Signature']?.[0]
            if (sigHeader && body.entry) {
              const json = JSON.stringify(body)
              const expectedSig = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(json).digest('hex')}`
              if (sigHeader === expectedSig) found.add('hmac_valid')
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (expected.every((e) => found.has(e))) return [...found]
    await sleep(1200)
  }
  return [...found]
}

async function waitForHealth(port, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`)
      if (res.ok) return true
    } catch {
      /* retry */
    }
    await sleep(500)
  }
  return false
}

async function main() {
  if (!webhookUuid) webhookUuid = await createWebhookSite()
  const webhookUrl = `https://webhook.site/${webhookUuid}`
  const port = 3098 + Math.floor(Math.random() * 100)

  console.log(`Webhook capture: ${webhookUrl}`)
  console.log(`Starting local API on port ${port}…\n`)

  const child = spawn(
    'npx',
    ['tsx', 'src/index.ts'],
    {
      cwd: new URL('../apps/api/', import.meta.url).pathname,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        SANCTUM_OFFLINE_MODE: 'true',
        SANCTUM_RISK_PROVIDER: 'none',
        SANCTUM_WEBHOOK_URL: webhookUrl,
        SANCTUM_WEBHOOK_SECRET: WEBHOOK_SECRET,
        SANCTUM_WEBHOOK_EVENTS:
          'verification.required,action.blocked,verification.resolved',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let failed = 0
  const log = (ok, msg) => {
    if (ok) console.log(`✓ ${msg}`)
    else {
      failed++
      console.error(`✗ ${msg}`)
    }
  }

  try {
    const up = await waitForHealth(port)
    if (!up) throw new Error('API did not start')
    log(true, `local API /health on :${port}`)

    const base = `http://127.0.0.1:${port}`
    const post = async (path, body) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return res.json()
    }

    const blockAction = `hook_block_${Date.now()}`
    await post('/v1/policies', {
      action: blockAction,
      requiresVerification: false,
      autoBlock: true,
    })

    const verifyRes = await post('/v1/actions/verify', {
      actor: 'hook-test',
      action: 'unlock_door',
      context: { owner_sleeping: true },
      offlineMode: true,
      correlationId: `hook-${Date.now()}`,
    })
    if (verifyRes.decision === 'REQUIRE_VERIFICATION') {
      log(true, 'trigger verification.required')
    } else {
      log(false, `expected REQUIRE_VERIFICATION, got ${verifyRes.decision}`)
    }

    let events = await pollEvents(webhookUuid, ['verification.required', 'hmac_valid'])
    log(events.includes('verification.required'), 'webhook verification.required delivered')
    log(events.includes('hmac_valid'), 'webhook HMAC signature valid')

    await post(`/v1/audit/${verifyRes.id}/resolve`, {
      decision: 'APPROVED',
      resolvedBy: 'hook-test',
    })
    events = await pollEvents(webhookUuid, [
      'verification.required',
      'verification.resolved',
      'hmac_valid',
    ])
    log(events.includes('verification.resolved'), 'webhook verification.resolved delivered')

    const blocked = await post('/v1/actions/verify', {
      actor: 'hook-test',
      action: blockAction,
      context: {},
      offlineMode: true,
    })
    if (blocked.decision === 'BLOCKED') log(true, 'trigger action.blocked')
    else log(false, `expected BLOCKED, got ${blocked.decision}`)

    events = await pollEvents(webhookUuid, [
      'verification.required',
      'verification.resolved',
      'action.blocked',
      'hmac_valid',
    ])
    log(events.includes('action.blocked'), 'webhook action.blocked delivered')

    const statusRes = await fetch(`${base}/v1/webhooks/status`)
    const status = await statusRes.json()
    log(status.configured === true, `GET /v1/webhooks/status (urls=${status.urlCount})`)

    console.log(failed ? `\n${failed} webhook check(s) failed` : '\nAll webhook checks passed')
    console.log(`\nTo test on Render, set Environment:\n  SANCTUM_WEBHOOK_URL=${webhookUrl}`)
    console.log(`  SANCTUM_WEBHOOK_SECRET=${WEBHOOK_SECRET}`)
    console.log(`  WEBHOOK_UUID=${webhookUuid}`)
    process.exit(failed ? 1 : 0)
  } finally {
    child.kill('SIGTERM')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
