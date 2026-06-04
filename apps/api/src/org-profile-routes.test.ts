import { describe, it, expect } from 'vitest'
import { isAccountProfileComplete, isPersonalWorkspaceOrgId } from './org-profile-routes.js'

describe('isAccountProfileComplete', () => {
  it('flags missing standard fields', () => {
    expect(
      isAccountProfileComplete({
        display_name: 'Jane',
        country_code: null,
        accepted_terms_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({ complete: false, missing: ['country_code'] })
  })

  it('passes when all required fields present', () => {
    expect(
      isAccountProfileComplete({
        display_name: 'Jane Doe',
        country_code: 'US',
        accepted_terms_at: '2026-01-01T00:00:00Z',
      }),
    ).toEqual({ complete: true, missing: [] })
  })
})

describe('isPersonalWorkspaceOrgId', () => {
  it('detects personal workspaces', () => {
    expect(isPersonalWorkspaceOrgId('personal-abc')).toBe(true)
  })
})
