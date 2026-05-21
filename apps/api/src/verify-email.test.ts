import { describe, it, expect, vi, afterEach } from 'vitest'
import { signVerifyToken, verifyToken } from './verify-email'

describe('verify-email tokens', () => {
  afterEach(() => vi.useRealTimers())

  it('round-trips a signed token', () => {
    const token = signVerifyToken('audit-123', 'APPROVED')
    const parsed = verifyToken(token)
    expect(parsed).toEqual({ id: 'audit-123', decision: 'APPROVED' })
  })

  it('round-trips BLOCKED decisions', () => {
    const token = signVerifyToken('audit-xyz', 'BLOCKED')
    expect(verifyToken(token)?.decision).toBe('BLOCKED')
  })

  it('rejects tampered payloads', () => {
    const token = signVerifyToken('audit-123', 'APPROVED')
    const [payload, sig] = token.split('.')
    const swapped = Buffer.from(JSON.stringify({ id: 'audit-EVIL', decision: 'APPROVED', exp: Date.now() + 1000 }))
      .toString('base64url')
    expect(verifyToken(`${swapped}.${sig}`)).toBeNull()
    expect(verifyToken(`${payload}.deadbeef`)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyToken('')).toBeNull()
    expect(verifyToken('not-a-token')).toBeNull()
    expect(verifyToken('only.one.dot.too.many')).toBeNull()
    expect(verifyToken('payload.')).toBeNull()
  })

  it('rejects expired tokens', () => {
    const token = signVerifyToken('audit-123', 'APPROVED')
    // Advance time past 24h expiry
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 25 * 3600 * 1000)
    expect(verifyToken(token)).toBeNull()
  })

  it('produces different tokens for different decisions on same id', () => {
    const a = signVerifyToken('audit-123', 'APPROVED')
    const b = signVerifyToken('audit-123', 'BLOCKED')
    expect(a).not.toBe(b)
  })
})
