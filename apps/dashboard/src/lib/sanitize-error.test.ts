import { describe, it, expect } from 'vitest'
import { isUpgradeError, responseError, sanitizeApiError } from './sanitize-error'

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
