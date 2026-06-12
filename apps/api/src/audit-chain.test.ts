import { describe, expect, it } from 'vitest'
import { computeChainFields } from './audit-chain.js'

describe('computeChainFields', () => {
  it('links to previous chain hash', () => {
    const row = {
      id: '1',
      org_id: 'org',
      correlation_id: 'c1',
      actor: 'a',
      action: 'test',
      decision: 'APPROVED',
      created_at: '2026-05-30T12:00:00.000Z',
    }
    const first = computeChainFields(row, null)
    const second = computeChainFields({ ...row, id: '2', correlation_id: 'c2' }, first.chain_hash)
    expect(first.prev_chain_hash).toBeNull()
    expect(second.prev_chain_hash).toBe(first.chain_hash)
    expect(second.chain_hash).not.toBe(first.chain_hash)
  })
})
