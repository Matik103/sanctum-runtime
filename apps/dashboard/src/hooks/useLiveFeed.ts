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
    agent_id?: string
    agent_name?: string
    tool_call_id: string
    arguments: unknown
  }
  created_at: string
}

function normalizeProxyEvent(raw: Record<string, unknown>): ProxyEvent | null {
  const ctx = (raw.context as Record<string, unknown> | undefined) ?? {}
  if (ctx.proxy !== true) return null
  const created =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.timestamp === 'string' && raw.timestamp) ||
    new Date().toISOString()
  return {
    id: String(raw.id ?? crypto.randomUUID()),
    org_id: String(raw.org_id ?? ctx.org_id ?? ''),
    action: String(raw.action ?? ''),
    actor: String(raw.actor ?? ''),
    decision: String(raw.decision ?? 'APPROVED'),
    context: {
      proxy: true,
      platform: String(ctx.platform ?? 'unknown'),
      agent_id: ctx.agent_id != null ? String(ctx.agent_id) : undefined,
      agent_name: ctx.agent_name != null ? String(ctx.agent_name) : undefined,
      tool_call_id: String(ctx.tool_call_id ?? ''),
      arguments: ctx.arguments,
    },
    created_at: created,
  }
}

async function fetchRecentProxyEvents(limit = 50): Promise<ProxyEvent[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${apiBaseUrl}/v1/audit?limit=${limit}`, { headers })
  if (!res.ok) return []
  const data = (await res.json()) as ProxyEvent[] | { entries?: ProxyEvent[] }
  const rows = Array.isArray(data) ? data : (data.entries ?? [])
  return rows
    .map((e) => normalizeProxyEvent(e as unknown as Record<string, unknown>))
    .filter((e): e is ProxyEvent => e != null)
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
          const entry = normalizeProxyEvent(payload.new as Record<string, unknown>)
          if (!entry) return
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
