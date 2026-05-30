import { describe, expect, it } from 'vitest'
import { suggestPolicyForTool } from './connect-tool-registry.js'

describe('suggestPolicyForTool', () => {
  it('recommends block for destructive action names', () => {
    const r = suggestPolicyForTool({ action: 'execute_shell' })
    expect(r.recommendation).toBe('block')
  })

  it('recommends verify for sensitive action names', () => {
    const r = suggestPolicyForTool({ action: 'send_email' })
    expect(r.recommendation).toBe('verify')
  })

  it('recommends verify when schema includes sensitive fields', () => {
    const r = suggestPolicyForTool({
      action: 'lookup_user',
      parameters_schema: { properties: { password: { type: 'string' } } },
    })
    expect(r.recommendation).toBe('verify')
  })

  it('recommends verify for frequently seen tools', () => {
    const r = suggestPolicyForTool({ action: 'lookup_user', seen_count: 12 })
    expect(r.recommendation).toBe('verify')
  })

  it('defaults to approve for benign tools', () => {
    const r = suggestPolicyForTool({ action: 'get_weather' })
    expect(r.recommendation).toBe('approve')
  })
})
