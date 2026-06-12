import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHeldConnectCount } from '../lib/agents-api'

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
    const id = window.setInterval(() => void refresh(), 8000)
    return () => window.clearInterval(id)
  }, [refresh])

  return { held, refreshHeld: refresh }
}
