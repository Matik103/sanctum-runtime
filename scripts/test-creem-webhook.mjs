#!/usr/bin/env node
/**
 * Send a signed Creem webhook to Supabase Edge Function (test mode).
 *
 *   CREEM_WEBHOOK_SECRET=whsec_... VITE_SUPABASE_URL=https://xxx.supabase.co \
 *     node scripts/test-creem-webhook.mjs --org-id personal-abc --plan personal
 */
import { createHmac } from 'node:crypto'

const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '')
const apiBase = process.env.SANCTUM_API_URL?.replace(/\/$/, '')
const target = supabaseUrl
  ? `${supabaseUrl}/functions/v1/creem-webhook`
  : apiBase
    ? `${apiBase}/v1/billing/webhook`
    : null

if (!target) {
  console.error('Set VITE_SUPABASE_URL or SUPABASE_URL (preferred), or SANCTUM_API_URL for legacy API')
  process.exit(1)
}

const secret = process.env.CREEM_WEBHOOK_SECRET?.trim()
if (!secret) {
  console.error('Set CREEM_WEBHOOK_SECRET (from Creem Developers → Webhooks)')
  process.exit(1)
}

const orgId = process.argv.includes('--org-id')
  ? process.argv[process.argv.indexOf('--org-id') + 1]
  : 'test-org-webhook'
const plan = process.argv.includes('--plan')
  ? process.argv[process.argv.indexOf('--plan') + 1]
  : 'personal'
const eventType = process.argv.includes('--event')
  ? process.argv[process.argv.indexOf('--event') + 1]
  : 'checkout.completed'

const payload = {
  id: `evt_test_${Date.now()}`,
  eventType,
  created_at: Date.now(),
  object: {
    id: 'ch_test',
    object: 'checkout',
    request_id: orgId,
    status: 'completed',
    metadata: { org_id: orgId, plan, referenceId: orgId },
    product: {
      id: process.env.CREEM_PRODUCT_PERSONAL || 'prod_test',
      name: 'Test',
    },
    customer: { id: 'cust_test', email: 'test@example.com' },
    subscription: {
      id: 'sub_test',
      object: 'subscription',
      metadata: { org_id: orgId, plan },
    },
  },
}

const body = JSON.stringify(payload)
const signature = createHmac('sha256', secret).update(body).digest('hex')

console.log('POST', target)
const res = await fetch(target, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'creem-signature': signature,
  },
  body,
})

const text = await res.text()
console.log(res.status, text)
process.exit(res.ok ? 0 : 1)
