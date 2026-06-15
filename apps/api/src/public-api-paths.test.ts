import { describe, it, expect } from 'vitest'
import { isPublicApiPath } from './public-api-paths.js'

describe('isPublicApiPath', () => {
  it('allows anonymous marketing support chat without login', () => {
    expect(isPublicApiPath('/v1/support/sessions')).toBe(true)
    expect(isPublicApiPath('/v1/support/chat')).toBe(true)
    expect(isPublicApiPath('/v1/support/chat/stream')).toBe(true)
    expect(isPublicApiPath('/v1/support/sessions/abc123/messages')).toBe(true)
    expect(isPublicApiPath('/v1/support/sessions/abc123/escalate')).toBe(true)
    expect(isPublicApiPath('/v1/support/messages/msg-uuid/feedback')).toBe(true)
  })

  it('still requires auth for operator inbox routes', () => {
    expect(isPublicApiPath('/v1/support/inbox/sessions')).toBe(false)
    expect(isPublicApiPath('/v1/support/inbox/analytics')).toBe(false)
  })

  it('still requires auth for operator API routes', () => {
    expect(isPublicApiPath('/v1/policies')).toBe(false)
    expect(isPublicApiPath('/v1/orgs')).toBe(false)
    expect(isPublicApiPath('/v1/actions/verify')).toBe(false)
  })
})
