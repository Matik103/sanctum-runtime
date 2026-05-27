import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken, getSupabase } from '../lib/supabase'

export type ProxyEvent = {
  id: string
  org_id: string
  action: string
  actor: string
  decision: string
  context: {
    proxy: true
    platform: string
    tool_call_id: string
    arguments: unknown
  }
  created_at: string
}

async function fetchRecentProxyEvents(limit = 50): Promise<ProxyEvent[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${apiBaseUrl}/v1/audit?limit=${limit}`, { headers })
  if (!res.ok) return []
  const data = (await res.json()) as { entries?: ProxyEvent[] }
  return (data.entries ?? []).filter(
    (e) => (e.context as Record<string, unknown>)?.proxy === true,
  )
}

export function useLiveFeed(orgId: string | null | undefined) {
  const [events, setEvents] = useState<ProxyEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null)

  // Initial load
  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    fetchRecentProxyEvents()
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orgId])

  // Supabase Realtime subscription for instant updates
  useEffect(() => {
    if (!orgId) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb
      .channel(`live-feed:${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_events',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const entry = payload.new as ProxyEvent
          if ((entry.context as Record<string, unknown>)?.proxy !== true) return
          setEvents((prev) => [entry, ...prev].slice(0, 200))
        },
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      void sb.removeChannel(channel)
      channelRef.current = null
      setConnected(false)
    }
  }, [orgId])

  return { events, connected, loading }
}
