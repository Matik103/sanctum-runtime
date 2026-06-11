import { useEffect, useState } from 'react'
import {
  canUsePolicyEditor,
  normalizePlanId,
  type PlanId,
} from '../lib/billing'
import { fetchBillingPlanFromSupabase } from '../lib/billing-supabase'
import { resolveDefaultWorkspaceOrg } from '../lib/workspace-org'

/** Current workspace org + plan tier for entitlement-aware UI. */
export function useWorkspacePlan() {
  const [orgId, setOrgId] = useState('')
  const [planId, setPlanId] = useState<PlanId>('observer')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const { orgId: resolvedOrg, orgs } = await resolveDefaultWorkspaceOrg()
        if (cancelled) return
        setOrgId(resolvedOrg)
        if (!resolvedOrg) {
          setPlanId('observer')
          return
        }
        const row = await fetchBillingPlanFromSupabase(resolvedOrg)
        if (cancelled) return
        setPlanId(normalizePlanId(row?.plan?.id))
        void orgs
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  return {
    orgId,
    planId,
    loading,
    canEditPolicies: canUsePolicyEditor(planId),
  }
}
