import { describe, expect, it } from 'vitest'
import { sameOriginNotificationTarget } from './notification-target'

const CONSOLE_ORIGIN = 'https://console.sanctumruntime.com'

describe('sameOriginNotificationTarget', () => {
  it('accepts local deep links used for verification pushes', () => {
    expect(
      sameOriginNotificationTarget('/?page=activity&verify=audit-123', CONSOLE_ORIGIN),
    ).toBe('/?page=activity&verify=audit-123')
  })

  it('normalizes absolute console links to internal navigation targets', () => {
    expect(
      sameOriginNotificationTarget(
        'https://console.sanctumruntime.com/?page=alerts#new',
        CONSOLE_ORIGIN,
      ),
    ).toBe('/?page=alerts#new')
  })

  it('rejects external links supplied by a notification payload', () => {
    expect(sameOriginNotificationTarget('https://example.com/sign-in', CONSOLE_ORIGIN)).toBeNull()
  })
})
