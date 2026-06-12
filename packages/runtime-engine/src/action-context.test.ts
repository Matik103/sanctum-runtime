import { describe, expect, it } from 'vitest'
import { estimateBlastRadius } from './action-context.js'

describe('estimateBlastRadius', () => {
  it('rates rm -rf / as critical, not low', () => {
    const result = estimateBlastRadius({
      actor: 'agent-1',
      action: 'rm -rf / --no-preserve-root',
      context: {},
    })
    expect(result.level).toBe('critical')
    expect(result.score).toBeGreaterThanOrEqual(80)
    expect(result.reversible).toBe(false)
    expect(result.factors).toContain('destructive shell / system command')
    expect(result.factors).toContain('root filesystem impact')
  })

  it('detects destructive commands in execute_terminal arguments', () => {
    const result = estimateBlastRadius({
      actor: 'agent-1',
      action: 'execute_terminal',
      context: { command: 'dd if=/dev/zero of=/dev/sda' },
    })
    expect(result.level).not.toBe('low')
    expect(result.reversible).toBe(false)
  })

  it('keeps benign read actions low', () => {
    const result = estimateBlastRadius({
      actor: 'agent-1',
      action: 'read_calendar',
      context: {},
    })
    expect(result.level).toBe('low')
    expect(result.score).toBeLessThan(35)
  })
})
