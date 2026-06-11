import { SanctumClient } from '@sanctum-runtime/sdk/browser'
import type { ActionPolicy, ActionRequest, ActionResult, Decision, PolicyMap, RiskLevel, RuntimeStatus } from '@sanctum-runtime/sdk/browser'
import { apiBaseUrl } from './api-url'
import { getAccessToken } from './supabase'
import { throwResponseError } from './sanitize-error'
import { resolveDefaultWorkspaceOrg } from './workspace-org'

export const api = new SanctumClient({
  baseUrl: apiBaseUrl,
  getAccessToken,
})

let cachedPolicyOrgId: { orgId: string; at: number } | null = null

async function resolvePolicyOrgId(explicit?: string): Promise<string | undefined> {
  if (explicit?.trim()) return explicit.trim()
  if (cachedPolicyOrgId && Date.now() - cachedPolicyOrgId.at < 60_000) {
    return cachedPolicyOrgId.orgId
  }
  const { orgId } = await resolveDefaultWorkspaceOrg()
  if (orgId) cachedPolicyOrgId = { orgId, at: Date.now() }
  return orgId || undefined
}

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

export async function fetchDashboard(orgId?: string): Promise<DashboardData> {
  const oid = await resolvePolicyOrgId(orgId)
  const [auditResult, policiesResult, statusResult] = await Promise.allSettled([
    api.getAudit(100, oid),
    api.getPolicies(oid),
    api.getStatus(),
  ])

  if (
    auditResult.status === 'rejected' &&
    policiesResult.status === 'rejected' &&
    statusResult.status === 'rejected'
  ) {
    throw auditResult.reason
  }

  const audit = auditResult.status === 'fulfilled' ? auditResult.value : []
  const policies = policiesResult.status === 'fulfilled' ? policiesResult.value : {}
  const status = statusResult.status === 'fulfilled' ? statusResult.value : null
  return { audit, policies, status }
}

export async function updatePolicyResponse(
  action: string,
  response: PolicyResponse,
  orgId?: string,
): Promise<PolicyMap> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.updatePolicy(action, responseToPolicy(response), oid)
}

export async function createPolicyResponse(
  action: string,
  response: PolicyResponse,
  orgId?: string,
): Promise<PolicyMap> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.createPolicy(action, responseToPolicy(response), oid)
}

export async function deletePolicyAction(action: string, orgId?: string): Promise<PolicyMap> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.deletePolicy(action, oid)
}

export async function exportPoliciesYaml(orgId?: string): Promise<string> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.exportPoliciesYaml(oid)
}

export async function updatePolicyConditions(
  action: string,
  conditions: import('@sanctum-runtime/sdk/browser').PolicyCondition[],
  orgId?: string,
): Promise<PolicyMap> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.updatePolicy(action, { conditions }, oid)
}

export type SimulateResult = {
  simulation: true
  decision: Decision
  risk: RiskLevel
  policyPath: string
  anomalyFlags: string[]
  sourceTrust?: ActionResult['sourceTrust']
  blastRadius?: ActionResult['blastRadius']
  actionIdentity?: ActionResult['actionIdentity']
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
  if (!res.ok) await throwResponseError(res, 'Simulation failed')
  return res.json() as Promise<SimulateResult>
}

export async function importPoliciesYaml(yaml: string, merge = true, orgId?: string): Promise<PolicyMap> {
  const oid = await resolvePolicyOrgId(orgId)
  return api.importPoliciesYaml(yaml, merge, oid)
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
    executionReports: number
    failedExecutions: number
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
  void orgId
  const h = await authHeaders()
  const res = await fetch(`${apiBaseUrl}/v1/fleet/pause-status`, { headers: h })
  if (!res.ok) await throwResponseError(res, 'Could not load fleet status')
  return res.json() as Promise<FleetPauseStatus>
}

export async function fleetPause(orgId?: string): Promise<FleetPauseStatus> {
  const h = await authHeaders()
  const res = await fetch(`${apiBaseUrl}/v1/fleet/pause`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(orgId ? { org_id: orgId } : {}),
  })
  if (!res.ok) await throwResponseError(res, 'Could not pause the fleet')
  return res.json() as Promise<FleetPauseStatus>
}

export async function fleetResume(orgId?: string): Promise<FleetPauseStatus> {
  const h = await authHeaders()
  const res = await fetch(`${apiBaseUrl}/v1/fleet/resume`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(orgId ? { org_id: orgId } : {}),
  })
  if (!res.ok) await throwResponseError(res, 'Could not resume the fleet')
  return res.json() as Promise<FleetPauseStatus>
}

export { type ActionRequest, type ActionResult, type Decision, type PolicyMap, type RiskLevel, type RuntimeStatus }
