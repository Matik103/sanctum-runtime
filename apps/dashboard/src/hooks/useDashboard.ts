import { useCallback, useEffect, useState } from 'react'
import {
  fetchDashboard,
  runUnlockDemo,
  updatePolicyResponse,
  type DashboardData,
  type PolicyResponse,
} from '../lib/api'
import type { ActionResult } from '@sanctum-runtime/sdk'

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

  const refresh = useCallback(async () => {
    try {
      const next = await fetchDashboard()
      setData(next)
      setApiError(null)
      const pending = next.audit.find((e) => e.decision === 'REQUIRE_VERIFICATION')
      setPendingVerification((cur) => cur ?? pending ?? null)
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
        setPendingVerification(result)
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

  const dismissVerification = () => setPendingVerification(null)

  return {
    ...data,
    loading,
    apiError,
    refresh,
    runDemo,
    setPolicy,
    pendingVerification,
    dismissVerification,
  }
}
