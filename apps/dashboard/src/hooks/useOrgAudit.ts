import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchOrgAuditPage, type AuditEntry, type AuditFilters } from '../lib/audit-api'

export function useOrgAudit(
  orgId: string | null | undefined,
  filters: AuditFilters = {},
  options: { limit?: number; pollMs?: number } = {},
) {
  const pageLimit = options.limit ?? 50
  const pollMs = options.pollMs ?? 15_000
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [totalApprox, setTotalApprox] = useState<number | null>(null)
  const [retentionDays, setRetentionDays] = useState(30)
  const filtersKey = JSON.stringify(filters)

  const load = useCallback(
    async (append = false, cursor?: string | null) => {
      if (!orgId) {
        setEntries([])
        setLoading(false)
        return
      }
      if (append) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      try {
        const parsed = JSON.parse(filtersKey) as AuditFilters
        const page = await fetchOrgAuditPage(orgId, parsed, {
          limit: pageLimit,
          cursor: append ? cursor ?? nextCursor : null,
        })
        setNextCursor(page.nextCursor)
        setTotalApprox(page.totalApprox)
        setRetentionDays(page.retentionDays)
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load audit')
        if (!append) setEntries([])
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [orgId, filtersKey, nextCursor, pageLimit],
  )

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return
    void load(true, nextCursor)
  }, [load, loadingMore, nextCursor])

  useEffect(() => {
    void load(false)
    const id = window.setInterval(() => void load(false), pollMs)
    return () => window.clearInterval(id)
  }, [orgId, filtersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    entries,
    loading,
    loadingMore,
    error,
    nextCursor,
    totalApprox,
    retentionDays,
    refresh: () => void load(false),
    loadMore,
  }
}
