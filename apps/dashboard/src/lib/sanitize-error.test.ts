import { describe, it, expect } from 'vitest'
import { sanitizeApiError } from './sanitize-error'

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
})
