import { describe, it, expect } from 'vitest'
import { isPersonalWorkspaceOrgId } from './org-profile-routes.js'

describe('isPersonalWorkspaceOrgId', () => {
  it('detects personal workspace org ids', () => {
    expect(isPersonalWorkspaceOrgId('personal-abc123def456')).toBe(true)
    expect(isPersonalWorkspaceOrgId('acme-robotics')).toBe(false)
  })
})
