import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '../lib/supabase'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'

export type ProxyEvent = {
  id: string
  action: string
  actor: string
  decision: string
  created_at: string
  context: {
    proxy?: boolean
    platform?: string
    tool_call_id?: string
    arguments?: unknown
  }
}

// Monotonic counter gives each subscription a unique channel name, preventing
// duplicate events when React StrictMode double-mounts effects.
let _channelSeq = 0

export function useLiveFeed(orgId: string | null) {
  const [events, setEvents] = useState<ProxyEvent[]>([])
  const [connected, setConnected] = useState(false)
  // Start loading=true so the empty-state never flashes before the first fetch completes
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Initial load — scoped to the current org, aborted if orgId changes
  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
    setFetchError(null)

    const controller = new AbortController()

    getAccessToken()
      .then((token) => {
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        return fetch(`${apiBaseUrl}/v1/audit?limit=50&org_id=${encodeURIComponent(orgId)}`, {
          headers,
          signal: controller.signal,
        })
      })
      .then(async (res) => {
        if (!res.ok) {
          setFetchError(res.status === 401 ? 'Session expired — please log in again.' : `Failed to load events (${res.status})`)
          return
        }
        const data = await res.json() as ProxyEvent[]
        setEvents(data.filter((e) => e.context?.proxy === true).slice(0, 50))
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setFetchError('Failed to load events.')
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [orgId])

  // Realtime subscription — unique channel name per mount prevents StrictMode double-fire
  const seqRef = useRef(0)
  useEffect(() => {
    if (!orgId) return
    const sb = getSupabase()
    if (!sb) return

    seqRef.current = ++_channelSeq
    const channel = sb
      .channel(`live-feed-${orgId}-${seqRef.current}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_events',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as ProxyEvent
          if (!row.context?.proxy) return
          setEvents((prev) => [row, ...prev].slice(0, 100))
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      void sb.removeChannel(channel)
      setConnected(false)
    }
  }, [orgId])

  return { events, connected, loading, fetchError }
}
