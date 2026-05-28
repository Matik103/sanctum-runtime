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
  // null = Realtime not yet available; true = connected; false = timed out / error
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'unavailable'>('connecting')
  // Keep loading=true while orgId is null so we never flash the empty state before org resolves
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Initial load — scoped to the current org, aborted if orgId changes
  useEffect(() => {
    if (!orgId) return   // stay loading=true until orgId is known
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

  // Realtime subscription — unique channel name per mount prevents StrictMode double-fire.
  // Falls back gracefully if Supabase Realtime is unavailable (migration not run, etc.)
  const seqRef = useRef(0)
  useEffect(() => {
    if (!orgId) return
    const sb = getSupabase()
    if (!sb) {
      setRealtimeStatus('unavailable')
      return
    }

    setRealtimeStatus('connecting')

    // Time out after 10 s — if Supabase Realtime is not enabled (migration 051
    // not run), the subscription never fires SUBSCRIBED.
    const connectTimeout = setTimeout(() => {
      setRealtimeStatus('unavailable')
    }, 10_000)

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
        if (status === 'SUBSCRIBED') {
          clearTimeout(connectTimeout)
          setRealtimeStatus('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(connectTimeout)
          setRealtimeStatus('unavailable')
        }
      })

    return () => {
      clearTimeout(connectTimeout)
      void sb.removeChannel(channel)
      setRealtimeStatus('connecting')
    }
  }, [orgId])

  return {
    events,
    connected: realtimeStatus === 'connected',
    realtimeStatus,
    loading,
    fetchError,
  }
}
