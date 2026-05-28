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

export function useLiveFeed(orgId: string | null) {
  const [events, setEvents] = useState<ProxyEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null)

  // Initial load
  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    getAccessToken()
      .then((token) => {
        const headers: Record<string, string> = {}
        if (token) headers['Authorization'] = `Bearer ${token}`
        return fetch(`${apiBaseUrl}/v1/audit?limit=50`, { headers })
      })
      .then(async (res) => {
        if (!res.ok) return
        const data = await res.json() as ProxyEvent[]
        setEvents(data.filter((e) => e.context?.proxy === true).slice(0, 50))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [orgId])

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb
      .channel(`live-feed-${orgId}`)
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

    channelRef.current = channel

    return () => {
      void sb.removeChannel(channel)
      setConnected(false)
    }
  }, [orgId])

  return { events, connected, loading }
}
