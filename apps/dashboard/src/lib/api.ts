import { SanctumClient } from '@sanctum-runtime/sdk'
import type { ActionPolicy, ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from '@sanctum-runtime/sdk'
import { getAccessToken } from './supabase'

export const api = new SanctumClient({
  baseUrl: '/api',
  getAccessToken,
})

export type PolicyResponse = 'approve' | 'verify' | 'block'

export function policyToResponse(policy: ActionPolicy): PolicyResponse {
  if (policy.autoBlock) return 'block'
  if (policy.requiresVerification) return 'verify'
  return 'approve'
}

export function responseToPolicy(response: PolicyResponse): Partial<ActionPolicy> {
  switch (response) {
    case 'approve':
      return { requiresVerification: false, autoBlock: false }
    case 'verify':
      return { requiresVerification: true, autoBlock: false }
    case 'block':
      return { requiresVerification: false, autoBlock: true }
  }
}

export { actionLabel } from './labels'

export type DashboardData = {
  audit: ActionResult[]
  policies: PolicyMap
  status: RuntimeStatus | null
}

export async function resolveVerification(
  id: string,
  decision: 'APPROVED' | 'BLOCKED',
  note?: string,
): Promise<ActionResult> {
  return api.resolveAuditEntry(id, {
    decision,
    resolvedBy: 'dashboard-operator',
    note,
  })
}

export async function fetchDashboard(): Promise<DashboardData> {
  const [audit, policies, status] = await Promise.all([
    api.getAudit(100),
    api.getPolicies(),
    api.getStatus(),
  ])
  return { audit, policies, status }
}

export async function updatePolicyResponse(
  action: string,
  response: PolicyResponse,
): Promise<PolicyMap> {
  return api.updatePolicy(action, responseToPolicy(response))
}

export { type ActionRequest, type ActionResult, type PolicyMap, type RuntimeStatus }
