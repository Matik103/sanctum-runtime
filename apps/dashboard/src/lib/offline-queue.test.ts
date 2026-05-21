// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { enqueue, dequeue, remove, queueSize, type QueuedMutation } from './offline-queue'

describe('offline-queue dedup', () => {
  beforeEach(async () => {
    // Drain any queue state left over from previous tests
    const all = await dequeue()
    for (const e of all) await remove(e.id)
  })

  it('persists a single mutation', async () => {
    const m: QueuedMutation = { type: 'resolve_verification', entryId: 'a1', decision: 'APPROVED' }
    await enqueue(m)
    expect(await queueSize()).toBe(1)
    const entries = await dequeue()
    expect(entries).toHaveLength(1)
    expect(entries[0].mutation).toEqual(m)
  })

  it('deduplicates repeated resolve for the same entryId', async () => {
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'APPROVED' })
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'BLOCKED' })
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'APPROVED' })

    expect(await queueSize()).toBe(1)
    const entries = await dequeue()
    // Last write wins
    expect(entries[0].mutation).toMatchObject({ entryId: 'a1', decision: 'APPROVED' })
  })

  it('deduplicates repeated policy updates for the same action', async () => {
    await enqueue({ type: 'update_policy', action: 'shell.rm', response: 'verify' })
    await enqueue({ type: 'update_policy', action: 'shell.rm', response: 'block' })
    expect(await queueSize()).toBe(1)
    const entries = await dequeue()
    expect(entries[0].mutation).toMatchObject({ action: 'shell.rm', response: 'block' })
  })

  it('keeps distinct mutations separate', async () => {
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'APPROVED' })
    await enqueue({ type: 'resolve_verification', entryId: 'a2', decision: 'APPROVED' })
    await enqueue({ type: 'update_policy', action: 'shell.rm', response: 'verify' })

    expect(await queueSize()).toBe(3)
  })

  it('preserves original queuedAt on dedup', async () => {
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'APPROVED' })
    const before = (await dequeue())[0].queuedAt
    await new Promise((r) => setTimeout(r, 5))
    await enqueue({ type: 'resolve_verification', entryId: 'a1', decision: 'BLOCKED' })
    const after = (await dequeue())[0].queuedAt
    expect(after).toBe(before)
  })
})
