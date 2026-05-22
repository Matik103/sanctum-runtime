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

export type AuditReplayChange = {
  id: string
  actor: string
  action: string
  previousDecision: Decision
  replayDecision: Decision
  previousRisk: RiskLevel
  replayRisk: RiskLevel
  policyPath: string
  anomalyFlags: string[]
}

export type AuditReplayResult = {
  replayedAt: string
  count: number
  decisions: Record<Decision, number>
  changedCount: number
  changed: AuditReplayChange[]
}

export type EvidenceSummary = {
  generatedAt: string
  orgId?: string
  controls: Record<string, boolean>
  policyCount: number
  auditWindow: {
    sampledEvents: number
    approved: number
    blocked: number
    verificationRequired: number
    signedApprovalTokens: number
    highBlastRadiusEvents: number
    untrustedSourceEvents: number
  }
  evidence: string[]
}

export async function replayAudit(limit = 100, orgId?: string): Promise<AuditReplayResult> {
  return api.replayAudit(limit, orgId) as Promise<AuditReplayResult>
}

export async function getEvidenceSummary(limit = 200, orgId?: string): Promise<EvidenceSummary> {
  return api.getEvidenceSummary(limit, orgId) as Promise<EvidenceSummary>
}

export async function verifyActionToken(token: string): Promise<{ valid: boolean; payload?: Record<string, unknown>; error?: string }> {
  return api.verifyActionToken(token)
}

export type FleetPauseStatus = {
  paused: boolean
  pausedAt?: string | null
  pausedBy?: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export async function getFleetStatus(orgId?: string): Promise<FleetPauseStatus> {
  const h = await authHeaders()
  const url = orgId
    ? `${apiBaseUrl}/v1/fleet/pause-status?org_id=${encodeURIComponent(orgId)}`
    : `${apiBaseUrl}/v1/fleet/pause-status`
  const res = await fetch(url, { headers: h })
  if (!res.ok) throw new Error(`Fleet status failed: ${res.status}`)
  return res.json() as Promise<FleetPauseStatus>
}

export async function fleetPause(orgId?: string): Promise<FleetPauseStatus> {
  const h = await authHeaders()
  const res = await fetch(`${apiBaseUrl}/v1/fleet/pause`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(orgId ? { org_id: orgId } : {}),
  })
  if (!res.ok) throw new Error(`Fleet pause failed: ${res.status}`)
  return res.json() as Promise<FleetPauseStatus>
}

export async function fleetResume(orgId?: string): Promise<FleetPauseStatus> {
  const h = await authHeaders()
  const res = await fetch(`${apiBaseUrl}/v1/fleet/resume`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(orgId ? { org_id: orgId } : {}),
  })
  if (!res.ok) throw new Error(`Fleet resume failed: ${res.status}`)
  return res.json() as Promise<FleetPauseStatus>
}

export { type ActionRequest, type ActionResult, type Decision, type PolicyMap, type RiskLevel, type RuntimeStatus }
