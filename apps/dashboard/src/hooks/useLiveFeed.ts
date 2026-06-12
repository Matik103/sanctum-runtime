import { useCallback, useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { isAuditRealtimeEnabled, useAuditEventsRealtime } from './useAuditEventsRealtime'

export type ProxyEvent = {
  id: string
  org_id: string
  action: string
  actor: string
  decision: string
  reasoning?: string
  correlation_id?: string
  sourceTrust?: string
  blastRadius?: {
    level: string
    score: number
    factors?: string[]
    reversible?: boolean
    dataSensitivity?: string
    externalDestination?: boolean
    physicalWorld?: boolean
    estimatedValue?: number
  }
  actionIdentity?: {
    actorId?: string
    toolId?: string
    runtimeId?: string
    environmentId?: string
    requestedPermission?: string
    scope?: string[]
    expiresAt?: string
  }
  context: {
    proxy: true
    platform: string
    agent_id?: string
    agent_name?: string
    tool_call_id: string
    arguments: unknown
    phase?: string
  }
  created_at: string
}

export type LiveFeedFilters = {
  decision?: string
  platform?: string
  action?: string
  agentId?: string
  heldOnly?: boolean
}

function buildLiveFeedUrl(orgId: string, filters: LiveFeedFilters, limit = 80): string {
  const params = new URLSearchParams({ limit: String(limit) })
  if (filters.decision) params.set('decision', filters.decision)
  if (filters.platform) params.set('platform', filters.platform)
  if (filters.action) params.set('action', filters.action)
  if (filters.agentId) params.set('agent_id', filters.agentId)
  if (filters.heldOnly) params.set('held_only', 'true')
  return `${apiBaseUrl}/v1/orgs/${orgId}/connect/live-feed?${params.toString()}`
}

async function fetchLiveFeedEvents(orgId: string, filters: LiveFeedFilters): Promise<ProxyEvent[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(buildLiveFeedUrl(orgId, filters), { headers })
  if (!res.ok) return []
  const data = (await res.json()) as { events?: ProxyEvent[] }
  return data.events ?? []
}

export function useLiveFeed(orgId: string | null | undefined, filters: LiveFeedFilters = {}) {
  const [events, setEvents] = useState<ProxyEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [heldCount, setHeldCount] = useState(0)
  const filtersKey = JSON.stringify(filters)

  const patchEvent = useCallback((id: string, patch: Partial<Pick<ProxyEvent, 'decision' | 'reasoning'>>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }, [])

  const loadRef = useRef<(showLoading?: boolean) => Promise<void>>(async () => {})

  useEffect(() => {
    if (!orgId) {
      setEvents([])
      setHeldCount(0)
      setConnected(false)
      setLoading(false)
      return
    }
    let cancelled = false

    const load = async (showLoading = false) => {
      if (showLoading) setLoading(true)
      const parsedFilters = JSON.parse(filtersKey) as LiveFeedFilters
      const token = await getAccessToken()
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const [rows, heldRes] = await Promise.all([
        fetchLiveFeedEvents(orgId, parsedFilters),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/connect/held-count`, { headers: authHeaders })
          .then((r) => (r.ok ? r.json() as Promise<{ held?: number }> : { held: 0 }))
          .catch(() => ({ held: 0 })),
      ])
      if (cancelled) return
      setEvents(rows)
      setHeldCount(typeof heldRes.held === 'number' ? heldRes.held : rows.filter((e) => e.decision === 'REQUIRE_VERIFICATION').length)
      if (showLoading) setLoading(false)
      setConnected(true)
    }

    loadRef.current = load
    void load(true)
    const pollMs = isAuditRealtimeEnabled() ? 15_000 : 2_000
    const pollId = window.setInterval(() => void load(false), pollMs)

    return () => {
      cancelled = true
      window.clearInterval(pollId)
      setConnected(false)
    }
  }, [orgId, filtersKey])

  useAuditEventsRealtime(orgId, () => {
    void loadRef.current(false)
  }, 'live-feed')

  return { events, connected, loading, heldCount, patchEvent }
}
