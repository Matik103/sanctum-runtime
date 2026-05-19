import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchDashboard,
  resolveVerification,
  updatePolicyResponse,
  type DashboardData,
  type PolicyResponse,
} from '../lib/api'
import { sanitizeApiError } from '../lib/sanitize-error'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'

const DISMISSED_KEY = 'sanctum-dismissed-verifications'

function loadDismissedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw) as string[]
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function saveDismissedIds(ids: Set<string>) {
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({
    audit: [],
    policies: {},
    status: null,
  })
  const [apiError, setApiError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [, bumpDismissed] = useState(0)
  const [pendingVerification, setPendingVerification] = useState<ActionResult | null>(
    null,
  )
  const dismissedVerificationIds = useRef<Set<string>>(loadDismissedIds())
  const auditRef = useRef<ActionResult[]>([])

  const markVerificationsDismissed = useCallback(
    (scope: 'all' | { action: string } | { id: string }) => {
      const dismissed = dismissedVerificationIds.current
      for (const e of auditRef.current) {
        if (e.decision !== 'REQUIRE_VERIFICATION') continue
        if (scope === 'all') {
          dismissed.add(e.id)
          continue
        }
        if ('action' in scope && e.action === scope.action) {
          dismissed.add(e.id)
          continue
        }
        if ('id' in scope && e.id === scope.id) {
          dismissed.add(e.id)
        }
      }
      if (scope !== 'all' && 'id' in scope) dismissed.add(scope.id)
      saveDismissedIds(dismissed)
      setPendingVerification(null)
      bumpDismissed((n) => n + 1)
    },
    [],
  )

  const showVerification = useCallback((entry: ActionResult) => {
    dismissedVerificationIds.current.delete(entry.id)
    setPendingVerification(entry)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const next = await fetchDashboard()
      auditRef.current = next.audit
      setData(next)
      setLastRefreshed(new Date())
      setApiError(null)

      const dismissed = dismissedVerificationIds.current
      setPendingVerification((cur) => {
        if (!cur) return null
        if (dismissed.has(cur.id)) return null
        return cur
      })
    } catch (e) {
      setApiError(sanitizeApiError(e, 'Failed to reach the API'))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(() => refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  const setPolicy = async (action: string, response: PolicyResponse) => {
    try {
      const policies = await updatePolicyResponse(action, response)
      setData((d) => ({ ...d, policies }))
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to update policy')
    }
  }

  const replacePolicies = (policies: DashboardData['policies']) => {
    setData((d) => ({ ...d, policies }))
  }

  const getPendingReviewQueue = useCallback(() => {
    return auditRef.current.filter(
      (e) =>
        e.decision === 'REQUIRE_VERIFICATION' &&
        !dismissedVerificationIds.current.has(e.id),
    )
  }, [])

  const pendingReviewQueue = data.audit.filter(
    (e) =>
      e.decision === 'REQUIRE_VERIFICATION' &&
      !dismissedVerificationIds.current.has(e.id),
  )

  const pendingReviewCount = pendingReviewQueue.length

  const getQueuePosition = useCallback(
    (entryId: string) => {
      const queue = getPendingReviewQueue()
      const index = queue.findIndex((e) => e.id === entryId)
      return index >= 0 ? { current: index + 1, total: queue.length } : undefined
    },
    [getPendingReviewQueue, pendingReviewCount],
  )

  const openNextPendingReview = useCallback(() => {
    const next = getPendingReviewQueue()[0]
    if (next) showVerification(next)
  }, [getPendingReviewQueue, showVerification])

  const dismissCurrentAndAdvance = useCallback(
    (entryId: string) => {
      markVerificationsDismissed({ id: entryId })
      const next = getPendingReviewQueue()[0]
      if (next) showVerification(next)
    },
    [markVerificationsDismissed, getPendingReviewQueue, showVerification],
  )

  const resolveVerificationEntry = useCallback(
    async (entryId: string, decision: 'APPROVED' | 'BLOCKED', grantDurationMinutes?: number) => {
      await resolveVerification(entryId, decision, { grantDurationMinutes })
      markVerificationsDismissed({ id: entryId })
      await refresh()
      const next = getPendingReviewQueue()[0]
      if (next) showVerification(next)
    },
    [markVerificationsDismissed, getPendingReviewQueue, showVerification, refresh],
  )

  return {
    ...data,
    lastRefreshed,
    apiError,
    refresh,
    setPolicy,
    replacePolicies,
    pendingVerification,
    pendingReviewCount,
    pendingReviewQueue,
    getQueuePosition,
    markVerificationsDismissed,
    openNextPendingReview,
    dismissCurrentAndAdvance,
    resolveVerificationEntry,
  }
}
