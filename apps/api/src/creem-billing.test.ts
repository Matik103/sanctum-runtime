import { createHmac } from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  normalizeCreemWebhookObject,
  orgIdFromCreemObject,
  planIdFromCreemProduct,
  resolveCreemPlanUpdate,
  verifyCreemSignature,
} from './creem-billing.js'

describe('creem-billing', () => {
  it('verifies HMAC signature', () => {
    const secret = 'test_secret'
    const body = '{"eventType":"checkout.completed"}'
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyCreemSignature(body, sig, secret)).toBe(true)
    expect(verifyCreemSignature(body, 'bad', secret)).toBe(false)
  })

  it('extracts org_id from checkout metadata', () => {
    expect(orgIdFromCreemObject({
      request_id: 'org_xyz',
      metadata: { org_id: 'org_abc', plan: 'personal' },
    })).toBe('org_abc')
  })

  it('grants on checkout.completed with product map', () => {
    const prev = process.env.CREEM_PRODUCT_PERSONAL
    process.env.CREEM_PRODUCT_PERSONAL = 'prod_personal_test'
    const update = resolveCreemPlanUpdate({
      eventType: 'checkout.completed',
      object: {
        object: 'checkout',
        request_id: 'org_1',
        metadata: { org_id: 'org_1', plan: 'personal' },
        product: { id: 'prod_personal_test' },
        customer: { id: 'cust_1' },
        subscription: { id: 'sub_1', metadata: { org_id: 'org_1' } },
      },
    })
    process.env.CREEM_PRODUCT_PERSONAL = prev
    expect(update.orgId).toBe('org_1')
    expect(update.planId).toBe('personal')
    expect(update.shouldUpsertPlan).toBe(true)
  })

  it('grants on subscription.paid when object is subscription', () => {
    const update = resolveCreemPlanUpdate({
      eventType: 'subscription.paid',
      object: {
        object: 'subscription',
        id: 'sub_1',
        metadata: { org_id: 'org_2', plan: 'operator' },
        product: { id: 'prod_op' },
        customer: { id: 'cust_2' },
      },
    })
    expect(update.orgId).toBe('org_2')
    expect(update.planId).toBe('operator')
    expect(update.subscriptionId).toBe('sub_1')
    expect(update.shouldUpsertPlan).toBe(true)
  })

  it('does not grant on subscription.active (sync only)', () => {
    const update = resolveCreemPlanUpdate({
      eventType: 'subscription.active',
      object: {
        object: 'subscription',
        id: 'sub_1',
        metadata: { org_id: 'org_2', plan: 'operator' },
        product: { id: 'prod_op' },
      },
    })
    expect(update.shouldUpsertPlan).toBe(false)
  })

  it('revokes on subscription.canceled', () => {
    const update = resolveCreemPlanUpdate({
      eventType: 'subscription.canceled',
      object: {
        object: 'subscription',
        id: 'sub_1',
        metadata: { org_id: 'org_1' },
      },
    })
    expect(update.planId).toBe('observer')
    expect(update.revoke).toBe(true)
    expect(update.shouldUpsertPlan).toBe(true)
  })

  it('normalizes subscription-shaped payloads', () => {
    const obj = normalizeCreemWebhookObject({
      eventType: 'subscription.paid',
      object: { object: 'subscription', id: 'sub_x' },
    })
    expect(obj.object).toBe('subscription')
    expect(obj.id).toBe('sub_x')
  })

  it('maps product id from env', () => {
    const prev = process.env.CREEM_PRODUCT_OPERATOR
    process.env.CREEM_PRODUCT_OPERATOR = 'prod_op'
    expect(planIdFromCreemProduct('prod_op')).toBe('operator')
    process.env.CREEM_PRODUCT_OPERATOR = prev
  })
})
