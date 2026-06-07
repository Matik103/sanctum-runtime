/**
 * Creem → Supabase (direct). Secrets: docs/CREEM_SUPABASE.md
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { productMap } from '../_shared/creem.ts'
import {
  claimCreemWebhookEvent,
  grantOrgPlan,
  markPaymentFailed,
  markScheduledCancel,
  revokeOrgPlan,
} from '../_shared/creem-org-plan.ts'
import {
  customerEmail,
  customerId,
  orgIdFrom,
  planFrom,
  resolveOrgId,
  subscriptionId,
} from '../_shared/creem-parse.ts'

const GRANT_EVENTS = new Set([
  'checkout.completed',
  'subscription.paid',
  'subscription.active',
  'subscription.trialing',
])
const REVOKE_EVENTS = new Set([
  'subscription.canceled',
  'subscription.cancelled',
  'subscription.expired',
  'subscription.paused',
])

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function verifySignature(raw: string, sig: string | null, secret: string): Promise<boolean> {
  if (!sig?.trim() || !secret) return false
  const expected = await hmacHex(secret, raw)
  const a = expected.trim().toLowerCase()
  const b = sig.trim().toLowerCase()
  if (a.length !== b.length) return false
  let ok = 0
  for (let i = 0; i < a.length; i++) ok |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return ok === 0
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const secret = Deno.env.get('CREEM_WEBHOOK_SECRET')?.trim()
  if (!secret) return Response.json({ error: 'webhook_not_configured' }, { status: 503 })

  const raw = await req.text()
  const sig = req.headers.get('creem-signature')
  if (!(await verifySignature(raw, sig, secret))) {
    return Response.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let event: { id?: string; eventType?: string; object?: Record<string, unknown> }
  try {
    event = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const eventId = event.id
  const eventType = event.eventType ?? ''
  const obj = (event.object ?? {}) as Record<string, unknown>
  const map = productMap()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const orgId = await resolveOrgId(admin, {
    orgId: orgIdFrom(obj),
    customerId: customerId(obj),
    email: customerEmail(obj),
  })

  if (!orgId && GRANT_EVENTS.has(eventType)) {
    return Response.json({ error: 'org_unresolved', eventType }, { status: 500 })
  }
  if (!orgId) return Response.json({ ok: true, skipped: true })

  const claimed = await claimCreemWebhookEvent(admin, eventId, eventType, orgId)
  if (!claimed) {
    return Response.json({ ok: true, duplicate: true, eventId, orgId })
  }

  if (REVOKE_EVENTS.has(eventType)) {
    await revokeOrgPlan(admin, orgId)
    return Response.json({ ok: true, orgId, planId: 'observer', eventType })
  }

  if (eventType === 'subscription.past_due') {
    await markPaymentFailed(admin, orgId)
    return Response.json({ ok: true, orgId, eventType })
  }

  if (eventType === 'subscription.scheduled_cancel') {
    await markScheduledCancel(admin, orgId)
    return Response.json({ ok: true, orgId, eventType })
  }

  if (GRANT_EVENTS.has(eventType)) {
    const planId = planFrom(obj, map)
    if (!planId) {
      return Response.json({ error: 'plan_unresolved', orgId, eventType }, { status: 500 })
    }
    await grantOrgPlan(admin, {
      orgId,
      planId,
      customerId: customerId(obj),
      subscriptionId: subscriptionId(obj),
      email: customerEmail(obj),
    })
    return Response.json({ ok: true, orgId, planId, eventType })
  }

  return Response.json({ ok: true, ignored: eventType })
})
