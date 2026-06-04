import { useCallback, useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { fetchMyOrgs } from '../lib/fleet'
import { getAccessToken, getSupabase } from '../lib/supabase'

const ENABLE_DIRECT_REALTIME =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DIRECT_SUPABASE_REALTIME === 'true'

export type InAppNotification = {
  id: string
  org_id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical' | 'emergency'
  status: 'open' | 'acknowledged' | 'resolved'
  metadata: Record<string, unknown>
  created_at: string
}

const SEEN_KEY = 'sanctum-seen-notification-ids'
let cachedAlertsOrgId: string | null | undefined
let alertsOrgIdPromise: Promise<string | null> | null = null

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveSeen(ids: Set<string>) {
  // Keep at most 200 IDs to avoid unbounded growth
  const trimmed = [...ids].slice(-200)
  localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed))
}

async function resolveAlertsOrgId(explicitOrgId?: string | null): Promise<string | null> {
  if (explicitOrgId) {
    cachedAlertsOrgId = explicitOrgId
    return explicitOrgId
  }
  if (cachedAlertsOrgId !== undefined) return cachedAlertsOrgId

  alertsOrgIdPromise ??= (async () => {
    const orgs = await fetchMyOrgs().catch(() => [])
    return orgs[0]?.org_id ?? null
  })()

  try {
    cachedAlertsOrgId = await alertsOrgIdPromise
    return cachedAlertsOrgId
  } finally {
    alertsOrgIdPromise = null
  }
}

async function fetchRecentAlerts(orgId?: string | null): Promise<InAppNotification[]> {
  const resolvedOrgId = await resolveAlertsOrgId(orgId)
  if (!resolvedOrgId) return []

  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(
    `${apiBaseUrl}/v1/orgs/${encodeURIComponent(resolvedOrgId)}/alerts?status=open&limit=20`,
    { headers },
  )
  if (!res.ok) return []
  const data = await res.json() as { alerts?: InAppNotification[] }
  return data.alerts ?? []
}

export function useInAppNotifications(orgId: string | null | undefined) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeen())
  const seenRef = useRef<Set<string>>(seenIds)
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null)

  const recalcUnread = useCallback((items: InAppNotification[]) => {
    const count = items.filter((n) => !seenRef.current.has(n.id)).length
    setUnread(count)
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) seenRef.current.add(n.id)
      saveSeen(seenRef.current)
      setSeenIds(new Set(seenRef.current))
      return prev
    })
    setUnread(0)
  }, [])

  const load = useCallback(async () => {
    const items = await fetchRecentAlerts(orgId).catch(() => [])
    setNotifications(items)
    recalcUnread(items)
  }, [orgId, recalcUnread])

  // Initial load + polling every 30s
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(timer)
  }, [load])

  // Supabase Realtime subscription for local development or explicitly
  // opted-in deployments. Production relies on the org-scoped Alerts API
  // poll above to avoid exposing database websocket URLs in the browser.
  useEffect(() => {
    if (!ENABLE_DIRECT_REALTIME) return
    if (!orgId) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb
      .channel(`alerts:${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const n = payload.new as InAppNotification
          setNotifications((prev) => [n, ...prev].slice(0, 20))
          setUnread((c) => c + 1)
        },
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      void sb.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId])

  return { notifications, unread, seenIds, markAllRead, reload: load }
}
