import { useCallback, useEffect, useState } from 'react'
import {
  fetchDashboard,
  runUnlockDemo,
  updatePolicyResponse,
  type DashboardData,
  type PolicyResponse,
} from '../lib/api'
import type { ActionResult } from '@sanctum/runtime'

export function useDashboard() {
  const [data, setData] = useState<DashboardData>({
    audit: [],
    policies: {},
    status: null,
  })
  const [loading, setLoading] = useState(false)
  const [pendingVerification, setPendingVerification] = useState<ActionResult | null>(
    null,
  )

  const refresh = useCallback(async () => {
    const next = await fetchDashboard()
    setData(next)
    const pending = next.audit.find((e) => e.decision === 'REQUIRE_VERIFICATION')
    setPendingVerification((cur) => cur ?? pending ?? null)
  }, [])

  useEffect(() => {
    refresh().catch(console.error)
    const id = setInterval(() => refresh().catch(console.error), 5000)
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
    refresh,
    runDemo,
    setPolicy,
    pendingVerification,
    dismissVerification,
  }
}
