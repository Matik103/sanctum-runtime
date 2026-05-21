import { SanctumClient } from '@sanctum-runtime/sdk/browser'
import type { ActionPolicy, ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'

export const api = new SanctumClient({
  baseUrl: apiBaseUrl,
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
  opts?: { note?: string; grantDurationMinutes?: number },
): Promise<ActionResult> {
  return api.resolveAuditEntry(id, {
    decision,
    resolvedBy: 'dashboard-operator',
    note: opts?.note,
    grantDurationMinutes: opts?.grantDurationMinutes,
  } as Parameters<typeof api.resolveAuditEntry>[1] & { grantDurationMinutes?: number })
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

export async function createPolicyResponse(
  action: string,
  response: PolicyResponse,
): Promise<PolicyMap> {
  return api.createPolicy(action, responseToPolicy(response))
}

export async function deletePolicyAction(action: string): Promise<PolicyMap> {
  return api.deletePolicy(action)
}

export async function exportPoliciesYaml(): Promise<string> {
  return api.exportPoliciesYaml()
}

export async function updatePolicyConditions(
  action: string,
  conditions: import('@sanctum-runtime/sdk/browser').PolicyCondition[],
): Promise<PolicyMap> {
  return api.updatePolicy(action, { conditions })
}

export type SimulateResult = {
  simulation: true
  decision: 'APPROVED' | 'BLOCKED' | 'REQUIRE_VERIFICATION'
  risk: 'low' | 'medium' | 'high'
  policyPath: string
  anomalyFlags: string[]
  conditionMatched: boolean
  policyFlags: {
    autoBlock: boolean
    requiresVerification: boolean
    blockWhenOffline: boolean
    allowedActors: string[]
    conditions: import('@sanctum-runtime/sdk/browser').PolicyCondition[]
  }
}

export async function simulateAction(
  actor: string,
  action: string,
  context: Record<string, unknown>,
): Promise<SimulateResult> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${apiBaseUrl}/v1/policies/simulate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ actor, action, context }),
  })
  if (!res.ok) throw new Error(`Simulate failed: ${res.status}`)
  return res.json() as Promise<SimulateResult>
}

export async function importPoliciesYaml(yaml: string, merge = true): Promise<PolicyMap> {
  return api.importPoliciesYaml(yaml, merge)
}

export { type ActionRequest, type ActionResult, type PolicyMap, type RuntimeStatus }
