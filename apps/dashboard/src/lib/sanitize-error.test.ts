import { describe, it, expect } from 'vitest'
import { isUpgradeError, looksLikeUpgradeMessage, responseError, sanitizeApiError } from './sanitize-error'

// In Vitest, import.meta.env.DEV is true, so the function returns err.message directly.
// We assert that branch here — it's the dev-mode contract. The production-mode mapping
// is covered by manual QA + the source's pure regex logic.
describe('sanitizeApiError (dev mode)', () => {
  it('returns fallback for non-Error inputs', () => {
    expect(sanitizeApiError('a string')).toBe('Request failed')
    expect(sanitizeApiError(null, 'custom')).toBe('custom')
    expect(sanitizeApiError(undefined)).toBe('Request failed')
  })

  it('passes through Error message in dev for debuggability', () => {
    expect(sanitizeApiError(new Error('Custom debug message'))).toBe('Custom debug message')
  })

  it('accepts custom fallback', () => {
    expect(sanitizeApiError({ unknown: 'shape' }, 'Save failed')).toBe('Save failed')
  })

  it('preserves structured plan gate messages and upgrade metadata', async () => {
    const err = await responseError(
      new Response(JSON.stringify({
        error: 'plan_feature_required',
        feature: 'api_access',
        currentPlan: 'observer',
        planName: 'Developer',
        message: 'Dashboard API keys require the Operator plan or higher.',
        upgradeUrl: '/billing',
      }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      }),
      'Could not create API key',
    )

    expect(err.message).toBe('Dashboard API keys require the Operator plan or higher.')
    expect(err.code).toBe('plan_feature_required')
    expect(err.feature).toBe('api_access')
    expect(err.upgradeUrl).toBe('/billing')
    expect(isUpgradeError(err)).toBe(true)
  })

  it('marks quota errors as upgrade errors', async () => {
    const err = await responseError(
      new Response(JSON.stringify({
        error: 'quota_exceeded',
        message: 'Monthly governed action quota reached. Upgrade your plan to continue.',
        upgradeUrl: '/billing',
      }), { status: 402 }),
      'Verify failed',
    )

    expect(err.message).toContain('Monthly governed action quota reached')
    expect(isUpgradeError(err)).toBe(true)
  })
})

describe('looksLikeUpgradeMessage', () => {
  it('matches entitlements-gate plan feature wording', () => {
    expect(looksLikeUpgradeMessage(
      'Compliance exports is not included on Developer. Upgrade to Team to use this feature.',
    )).toBe(true)
  })

  it('matches agent limit wording', () => {
    expect(looksLikeUpgradeMessage(
      'Your Developer plan allows 2 active agents. Revoke an agent or upgrade to add more.',
    )).toBe(true)
  })

  it('matches quota reached wording', () => {
    expect(looksLikeUpgradeMessage(
      'Monthly governed actions quota reached (500 / 500). Upgrade your plan to continue.',
    )).toBe(true)
  })

  it('matches observe-only block reasoning', () => {
    expect(looksLikeUpgradeMessage(
      'Developer is observe-only. Upgrade to verify, hold, approve, block, or gate agent actions.',
    )).toBe(true)
  })

  it('does not match plain failures', () => {
    expect(looksLikeUpgradeMessage(
      'Policy changes require Personal or higher.',
    )).toBe(true)
    expect(looksLikeUpgradeMessage('Could not delete the alert rule')).toBe(false)
    expect(looksLikeUpgradeMessage('Server error — try again shortly')).toBe(false)
  })
})
