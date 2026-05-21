import { useCallback, useEffect, useRef, useState } from 'react'
import { useNetworkStatus } from './useNetworkStatus'
import { enqueue, dequeue, remove, queueSize } from '../lib/offline-queue'
import type { QueuedMutation } from '../lib/offline-queue'
import { resolveVerification, updatePolicyResponse } from '../lib/api'

export type OfflineQueueState = {
  /** Number of mutations waiting to sync */
  pendingCount: number
  /** True while replaying queued mutations after coming back online */
  syncing: boolean
  /** Enqueue a mutation to run when online (or run immediately if already online) */
  mutate: (m: QueuedMutation) => Promise<void>
}

export function useOfflineQueue(onSynced?: () => void): OfflineQueueState {
  const online = useNetworkStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // Keep count fresh on mount and after any change
  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await queueSize())
    } catch {
      /* IDB unavailable in some private-browsing contexts */
    }
  }, [])

  useEffect(() => { void refreshCount() }, [refreshCount])

  // Replay queue when we come back online
  const replayQueue = useCallback(async () => {
    if (syncingRef.current) return
    const entries = await dequeue()
    if (entries.length === 0) return

    syncingRef.current = true
    setSyncing(true)

    for (const entry of entries) {
      try {
        const m = entry.mutation
        if (m.type === 'resolve_verification') {
          await resolveVerification(m.entryId, m.decision)
        } else if (m.type === 'update_policy') {
          await updatePolicyResponse(m.action, m.response)
        }
        await remove(entry.id)
      } catch {
        // Leave it in the queue — will retry on next reconnect
        break
      }
    }

    syncingRef.current = false
    setSyncing(false)
    await refreshCount()
    if (onSynced) onSynced()
  }, [refreshCount, onSynced])

  const prevOnline = useRef(online)
  useEffect(() => {
    if (online && !prevOnline.current) {
      void replayQueue()
    }
    prevOnline.current = online
  }, [online, replayQueue])

  const mutate = useCallback(async (m: QueuedMutation) => {
    if (online) {
      // Online: execute immediately, no queuing needed
      if (m.type === 'resolve_verification') {
        await resolveVerification(m.entryId, m.decision)
      } else if (m.type === 'update_policy') {
        await updatePolicyResponse(m.action, m.response)
      }
    } else {
      await enqueue(m)
      await refreshCount()
    }
  }, [online, refreshCount])

  return { pendingCount, syncing, mutate }
}
