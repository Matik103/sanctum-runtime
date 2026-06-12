import { useEffect, useRef } from 'react'
import { getSupabase } from '../lib/supabase'

/** Direct Realtime when Supabase is configured; opt out with VITE_ENABLE_DIRECT_SUPABASE_REALTIME=false */
export function isAuditRealtimeEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_DIRECT_SUPABASE_REALTIME === 'false') return false
  return Boolean(getSupabase())
}

/** Subscribe to org-scoped audit_events inserts/updates when direct Realtime is enabled. */
export function useAuditEventsRealtime(
  orgId: string | null | undefined,
  onChange: () => void,
  /** Unique per hook — Supabase rejects .on() after subscribe() on a reused channel name. */
  channelKey = 'default',
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!isAuditRealtimeEnabled() || !orgId) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb
      .channel(`audit_events:${orgId}:${channelKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_events',
          filter: `org_id=eq.${orgId}`,
        },
        () => onChangeRef.current(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audit_events',
          filter: `org_id=eq.${orgId}`,
        },
        () => onChangeRef.current(),
      )
      .subscribe()

    return () => {
      void sb.removeChannel(channel)
    }
  }, [orgId, channelKey])
}
