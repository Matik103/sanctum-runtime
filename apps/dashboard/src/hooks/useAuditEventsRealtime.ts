import { useEffect, useRef } from 'react'
import { getSupabase } from '../lib/supabase'

const ENABLE_DIRECT_REALTIME =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DIRECT_SUPABASE_REALTIME === 'true'

/** Subscribe to org-scoped audit_events inserts/updates when direct Realtime is enabled. */
export function useAuditEventsRealtime(
  orgId: string | null | undefined,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!ENABLE_DIRECT_REALTIME || !orgId) return
    const sb = getSupabase()
    if (!sb) return

    const channel = sb
      .channel(`audit_events:${orgId}`)
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
  }, [orgId])
}

export function isAuditRealtimeEnabled(): boolean {
  return ENABLE_DIRECT_REALTIME && Boolean(getSupabase())
}
