/** Parse Creem checkout/webhook objects (shared by webhook + sync). */

const PLAN_IDS = new Set(['personal', 'operator', 'team', 'enterprise'])

export function metadataLayers(obj: Record<string, unknown>): Record<string, unknown> {
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

export function orgIdFrom(obj: Record<string, unknown>): string | null {
  const meta = metadataLayers(obj)
  for (const c of [meta.org_id, meta.orgId, meta.referenceId, obj.request_id, obj.referenceId]) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

export function productIdFrom(obj: Record<string, unknown>): string | null {
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

export function planFrom(obj: Record<string, unknown>, map: Record<string, string>): string | null {
  const meta = metadataLayers(obj)
  const plan = meta.plan ?? meta.plan_id
  if (typeof plan === 'string' && PLAN_IDS.has(plan)) return plan
  const pid = productIdFrom(obj)
  return pid && map[pid] ? map[pid] : null
}

export function customerEmail(obj: Record<string, unknown>): string | null {
  const c = obj.customer
  if (c && typeof c === 'object' && 'email' in c) {
    const e = (c as { email?: string }).email
    if (e?.includes('@')) return e.trim().toLowerCase()
  }
  return null
}

export function customerId(obj: Record<string, unknown>): string | null {
  const c = obj.customer
  if (typeof c === 'string') return c
  if (c && typeof c === 'object' && 'id' in c) return String((c as { id?: string }).id ?? '') || null
  return null
}

export function subscriptionId(obj: Record<string, unknown>): string | null {
  const sub = obj.subscription
  if (typeof sub === 'string') return sub
  if (sub && typeof sub === 'object' && 'id' in sub) return String((sub as { id?: string }).id ?? '') || null
  if (obj.object === 'subscription' && typeof obj.id === 'string') return obj.id
  return null
}

export async function resolveOrgId(
  admin: { from: (t: string) => ReturnType<import('https://esm.sh/@supabase/supabase-js@2').SupabaseClient['from']> },
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
