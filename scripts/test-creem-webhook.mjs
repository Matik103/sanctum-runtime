#!/usr/bin/env node
/**
 * Send a signed Creem webhook to local API (test mode).
 *
 *   CREEM_WEBHOOK_SECRET=whsec_... SANCTUM_API_URL=http://127.0.0.1:3001 \
 *     node scripts/test-creem-webhook.mjs --org-id personal-abc --plan personal
 */
import { createHmac } from 'node:crypto'

const apiBase = (process.env.SANCTUM_API_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
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

const res = await fetch(`${apiBase}/v1/billing/webhook`, {
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
