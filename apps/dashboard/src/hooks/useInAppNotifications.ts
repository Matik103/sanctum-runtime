import { useCallback, useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken, getSupabase } from '../lib/supabase'

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

async function fetchRecentAlerts(): Promise<InAppNotification[]> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(
    `${apiBaseUrl}/v1/alerts?status=open&limit=20`,
    { headers },
  )
  if (!res.ok) return []
  const data = await res.json() as { alerts?: InAppNotification[] }
  return data.alerts ?? []
}

export function useInAppNotifications(orgId: string | null | undefined) {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const seenRef = useRef<Set<string>>(loadSeen())
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null)

  const recalcUnread = useCallback((items: InAppNotification[]) => {
    const count = items.filter((n) => !seenRef.current.has(n.id)).length
    setUnread(count)
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => {
      for (const n of prev) seenRef.current.add(n.id)
      saveSeen(seenRef.current)
      return prev
    })
    setUnread(0)
  }, [])

  const load = useCallback(async () => {
    const items = await fetchRecentAlerts().catch(() => [])
    setNotifications(items)
    recalcUnread(items)
  }, [recalcUnread])

  // Initial load + polling every 30s
  useEffect(() => {
    void load()
    const timer = setInterval(() => { void load() }, 30_000)
    return () => clearInterval(timer)
  }, [load])

  // Supabase Realtime subscription for instant updates when tab is open
  useEffect(() => {
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

  return { notifications, unread, markAllRead, reload: load }
}
