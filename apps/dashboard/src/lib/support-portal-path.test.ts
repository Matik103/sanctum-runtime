import { describe, expect, it } from 'vitest'
import { buildSupportPortalUrl } from './support-portal-path'

describe('buildSupportPortalUrl', () => {
  it('uses query params so static hosts can boot from /', () => {
    const url = buildSupportPortalUrl('sess_abc123')
    expect(url).toContain('page=support-inbox')
    expect(url).toContain('session=sess_abc123')
    expect(url).not.toContain('/support?')
  })
})
