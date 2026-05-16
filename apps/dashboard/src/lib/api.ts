import { SanctumClient } from '@sanctum-runtime/sdk'
import type { ActionPolicy, ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from '@sanctum-runtime/sdk'

export const api = new SanctumClient({ baseUrl: '/api' })

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
      return { requiresVerification: true, autoBlock: true }
  }
}

export { actionLabel } from './labels'

export async function runUnlockDemo(offline: boolean): Promise<ActionResult> {
  const client = new SanctumClient({ baseUrl: '/api', offlineMode: offline })
  return client.verifyAction({
    actor: 'local-agent',
    action: 'unlock_door',
    context: {
      location: 'front_door',
      time: '02:13 AM',
      owner_sleeping: true,
    },
  })
}

export type DashboardData = {
  audit: ActionResult[]
  policies: PolicyMap
  status: RuntimeStatus | null
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
