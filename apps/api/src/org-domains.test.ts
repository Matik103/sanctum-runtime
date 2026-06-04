import { describe, it, expect } from 'vitest'
import { BLOCKED_EMAIL_DOMAINS, normalizeEmailDomain } from './org-domains.js'

describe('normalizeEmailDomain', () => {
  it('normalizes and rejects public mailbox domains', () => {
    expect(normalizeEmailDomain('Acme.COM')).toBe('acme.com')
    expect(normalizeEmailDomain('@acme.com')).toBe('acme.com')
    expect(normalizeEmailDomain('gmail.com')).toBeNull()
    expect(BLOCKED_EMAIL_DOMAINS.has('gmail.com')).toBe(true)
  })
})
