import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchDashboard,
  runUnlockDemo,
  updatePolicyResponse,
  type DashboardData,
  type PolicyResponse,
} from '../lib/api'
import type { ActionResult } from '@sanctum-runtime/sdk'

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
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
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
      if ('id' in scope) dismissed.add(scope.id)
      saveDismissedIds(dismissed)
      setPendingVerification(null)
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
      setApiError(null)

      const dismissed = dismissedVerificationIds.current
      setPendingVerification((cur) => {
        if (!cur) return null
        if (dismissed.has(cur.id)) return null
        return cur
      })
    } catch (e) {
      const msg =
        e instanceof Error && e.message.includes('500')
          ? 'Runtime API is not running. From the repo root run: npm run dev:runtime (or npm run dev:api in another terminal).'
          : e instanceof Error
            ? e.message
            : 'Failed to reach runtime API'
      setApiError(msg)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(() => refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  const runDemo = async (offline: boolean) => {
    setLoading(true)
    try {
      const result = await runUnlockDemo(offline)
      if (result.decision === 'REQUIRE_VERIFICATION') {
        showVerification(result)
      } else {
        markVerificationsDismissed({ id: result.id })
      }
      await refresh()
      return result
    } finally {
      setLoading(false)
    }
  }

  const setPolicy = async (action: string, response: PolicyResponse) => {
    const policies = await updatePolicyResponse(action, response)
    setData((d) => ({ ...d, policies }))
  }

  const pendingReviewCount = data.audit.filter(
    (e) =>
      e.decision === 'REQUIRE_VERIFICATION' &&
      !dismissedVerificationIds.current.has(e.id),
  ).length

  const openNextPendingReview = useCallback(() => {
    const next = auditRef.current.find(
      (e) =>
        e.decision === 'REQUIRE_VERIFICATION' &&
        !dismissedVerificationIds.current.has(e.id),
    )
    if (next) showVerification(next)
  }, [showVerification])

  return {
    ...data,
    loading,
    apiError,
    refresh,
    runDemo,
    setPolicy,
    pendingVerification,
    pendingReviewCount,
    markVerificationsDismissed,
    openNextPendingReview,
  }
}
