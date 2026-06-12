import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHeldConnectCount } from '../lib/agents-api'
import { isAuditRealtimeEnabled, useAuditEventsRealtime } from './useAuditEventsRealtime'

/** Poll held Connect verification count for sidebar badge + notifications. */
export function useHeldCount(orgId: string | null | undefined) {
  const [held, setHeld] = useState(0)
  const prevHeld = useRef(0)

  const refresh = useCallback(async () => {
    if (!orgId) {
      setHeld(0)
      return
    }
    const count = await fetchHeldConnectCount(orgId).catch(() => 0)
    setHeld(count)
    if (count > prevHeld.current && count > 0 && typeof Notification !== 'undefined') {
      if (Notification.permission === 'granted') {
        new Notification('Sanctum — action awaiting approval', {
          body: `${count} Connect tool call${count === 1 ? '' : 's'} held for review.`,
          tag: 'sanctum-held-queue',
        })
      }
    }
    prevHeld.current = count
  }, [orgId])

  useEffect(() => {
    void refresh()
    const pollMs = isAuditRealtimeEnabled() ? 20_000 : 8_000
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(id)
  }, [refresh])

  useAuditEventsRealtime(orgId, () => {
    void refresh()
  }, 'held-count')

  return { held, refreshHeld: refresh }
}
