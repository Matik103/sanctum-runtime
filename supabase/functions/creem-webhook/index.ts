/**
 * Creem → Supabase (direct). Point Creem webhook URL here instead of Render API.
 *
 * Secrets (Supabase Dashboard → Edge Functions → creem-webhook):
 *   CREEM_WEBHOOK_SECRET, CREEM_PRODUCT_PERSONAL, CREEM_PRODUCT_OPERATOR, CREEM_PRODUCT_TEAM
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const PLAN_IDS = new Set(['personal', 'operator', 'team', 'enterprise'])

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

function productMap(): Record<string, string> {
  const map: Record<string, string> = {}
  const pairs: [string | undefined, string][] = [
    [Deno.env.get('CREEM_PRODUCT_PERSONAL'), 'personal'],
    [Deno.env.get('CREEM_PRODUCT_OPERATOR'), 'operator'],
    [Deno.env.get('CREEM_PRODUCT_TEAM'), 'team'],
    [Deno.env.get('CREEM_PRODUCT_ENTERPRISE'), 'enterprise'],
  ]
  for (const [id, plan] of pairs) {
    if (id?.trim()) map[id.trim()] = plan
  }
  return map
}

function metadataLayers(obj: Record<string, unknown>): Record<string, unknown> {
  const layers: Record<string, unknown>[] = []
  const m = obj.metadata
  if (m && typeof m === 'object' && !Array.isArray(m)) layers.push(m as Record<string, unknown>)
  const order = obj.order
  if (order && typeof order === 'object' && !Array.isArray(order)) {
    const om = (order as { metadata?: Record<string, unknown> }).metadata
    if (om && typeof om === 'object') layers.push(om)
  }
  const sub = obj.subscription
  if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
    const sm = (sub as { metadata?: Record<string, unknown> }).metadata
    if (sm && typeof sm === 'object') layers.push(sm)
  }
  const out: Record<string, unknown> = {}
  for (const layer of layers.reverse()) Object.assign(out, layer)
  return out
}

function orgIdFrom(obj: Record<string, unknown>): string | null {
  const meta = metadataLayers(obj)
  for (const c of [meta.org_id, meta.orgId, meta.referenceId, obj.request_id, obj.referenceId]) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

function productIdFrom(obj: Record<string, unknown>): string | null {
  const p = obj.product
  if (typeof p === 'string' && p) return p
  if (p && typeof p === 'object' && 'id' in p) return String((p as { id?: string }).id ?? '') || null
  const order = obj.order
  if (order && typeof order === 'object' && 'product' in order) {
    const op = (order as { product?: string }).product
    if (op) return op
  }
  const sub = obj.subscription
  if (sub && typeof sub === 'object') {
    const sp = (sub as { product?: string | { id?: string } }).product
    if (typeof sp === 'string') return sp
    if (sp && typeof sp === 'object' && sp.id) return sp.id
  }
  return null
}

function planFrom(obj: Record<string, unknown>, map: Record<string, string>): string | null {
  const meta = metadataLayers(obj)
  const plan = meta.plan ?? meta.plan_id
  if (typeof plan === 'string' && PLAN_IDS.has(plan)) return plan
  const pid = productIdFrom(obj)
  return pid && map[pid] ? map[pid] : null
}

function customerEmail(obj: Record<string, unknown>): string | null {
  const c = obj.customer
  if (c && typeof c === 'object' && 'email' in c) {
    const e = (c as { email?: string }).email
    if (e?.includes('@')) return e.trim().toLowerCase()
  }
  return null
}

function customerId(obj: Record<string, unknown>): string | null {
  const c = obj.customer
  if (typeof c === 'string') return c
  if (c && typeof c === 'object' && 'id' in c) return String((c as { id?: string }).id ?? '') || null
  return null
}

function subscriptionId(obj: Record<string, unknown>): string | null {
  const sub = obj.subscription
  if (typeof sub === 'string') return sub
  if (sub && typeof sub === 'object' && 'id' in sub) return String((sub as { id?: string }).id ?? '') || null
  if (obj.object === 'subscription' && typeof obj.id === 'string') return obj.id
  return null
}

async function resolveOrgId(
  admin: ReturnType<typeof createClient>,
  hint: { orgId: string | null; customerId: string | null; email: string | null },
): Promise<string | null> {
  if (hint.orgId) return hint.orgId
  if (hint.customerId) {
    const { data } = await admin.from('org_plans').select('org_id').eq('creem_customer_id', hint.customerId).maybeSingle()
    if (data?.org_id) return data.org_id as string
  }
  if (hint.email) {
    const { data: profile } = await admin.from('profiles').select('id, billing_org_id').ilike('email', hint.email).maybeSingle()
    if (profile?.billing_org_id) return profile.billing_org_id as string
    if (profile?.id) {
      const { data: mems } = await admin
        .from('organization_members')
        .select('org_id')
        .eq('user_id', profile.id)
        .order('org_id')
      const personal = mems?.find((m) => String(m.org_id).startsWith('personal-'))
      return (personal?.org_id as string) ?? (mems?.[0]?.org_id as string) ?? null
    }
  }
  return null
}

async function linkBillingOrg(admin: ReturnType<typeof createClient>, orgId: string, email: string | null) {
  const ids = new Set<string>()
  if (email) {
    const { data: p } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
    if (p?.id) ids.add(p.id as string)
  }
  const { data: owners } = await admin.from('organization_members').select('user_id').eq('org_id', orgId).in('role', ['owner', 'admin'])
  for (const o of owners ?? []) if (o.user_id) ids.add(o.user_id as string)
  const now = new Date().toISOString()
  for (const id of ids) {
    await admin.from('profiles').update({ billing_org_id: orgId, updated_at: now }).eq('id', id)
  }
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

  const now = new Date().toISOString()

  if (REVOKE_EVENTS.has(eventType)) {
    await admin.from('org_plans').upsert({
      org_id: orgId,
      plan_id: 'observer',
      creem_subscription_status: 'canceled',
      billing_status: 'canceled',
      updated_at: now,
    }, { onConflict: 'org_id' })
    return Response.json({ ok: true, orgId, planId: 'observer', eventType })
  }

  if (eventType === 'subscription.past_due') {
    await admin.from('org_plans').upsert({
      org_id: orgId,
      creem_subscription_status: 'past_due',
      billing_status: 'payment_failed',
      updated_at: now,
    }, { onConflict: 'org_id' })
    return Response.json({ ok: true, orgId, eventType })
  }

  if (GRANT_EVENTS.has(eventType)) {
    const planId = planFrom(obj, map)
    if (!planId) {
      return Response.json({ error: 'plan_unresolved', orgId, eventType }, { status: 500 })
    }
    await admin.from('org_plans').upsert({
      org_id: orgId,
      plan_id: planId,
      creem_customer_id: customerId(obj),
      creem_subscription_id: subscriptionId(obj),
      creem_subscription_status: 'active',
      billing_status: 'active',
      billing_cycle_anchor: now,
      updated_at: now,
    }, { onConflict: 'org_id' })
    await linkBillingOrg(admin, orgId, customerEmail(obj))
    return Response.json({ ok: true, orgId, planId, eventType })
  }

  return Response.json({ ok: true, ignored: eventType })
})
