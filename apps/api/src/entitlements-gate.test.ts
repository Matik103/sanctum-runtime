import { describe, expect, it } from 'vitest'
import { PLAN_DEFAULTS } from './entitlements.js'
import {
  canEvaluateShieldRules,
  canUseAgentMemory,
  canUseApiAccess,
  canUseAuditReplay,
  canUseComplianceExport,
  canUseConnectGate,
  canUseCustomShield,
  canUseDelegations,
  canUseFleetControls,
  canApproveHolds,
  canUseAlertChannels,
  canUseGovernanceWorkflows,
  canUseMarketplaceInstalls,
  canUseMarketplacePublishing,
  canUseOrchestration,
  canUsePolicyVersioning,
} from './entitlements-gate.js'

describe('entitlements-gate', () => {
  it('observer cannot gate or custom shield', () => {
    const o = PLAN_DEFAULTS.observer
    expect(canUseConnectGate(o)).toBe(false)
    expect(canEvaluateShieldRules(o)).toBe(false)
    expect(canUseCustomShield(o)).toBe(false)
    expect(canUseGovernanceWorkflows(o)).toBe(false)
    expect(canUseFleetControls(o)).toBe(false)
    expect(canUseOrchestration(o)).toBe(false)
    expect(canUseComplianceExport(o)).toBe(false)
    expect(canUseAuditReplay(o)).toBe(false)
    expect(canUsePolicyVersioning(o)).toBe(false)
    expect(canUseAgentMemory(o)).toBe(false)
    expect(canUseApiAccess(o)).toBe(false)
    expect(canUseDelegations(o)).toBe(false)
    expect(canUseMarketplaceInstalls(o)).toBe(false)
    expect(canUseMarketplacePublishing(o)).toBe(false)
  })

  it('personal can gate and light shield but not custom shield CRUD', () => {
    const p = PLAN_DEFAULTS.personal
    expect(canUseConnectGate(p)).toBe(true)
    expect(canEvaluateShieldRules(p)).toBe(true)
    expect(canUseCustomShield(p)).toBe(false)
    expect(canUseGovernanceWorkflows(p)).toBe(false)
    expect(canApproveHolds(p)).toBe(true)
    expect(canUseAlertChannels(p, ['email'])).toBe(true)
    expect(canUseAlertChannels(p, ['webhook'])).toBe(false)
    expect(canUseAuditReplay(p)).toBe(true)
    expect(canUsePolicyVersioning(p)).toBe(true)
    expect(canUseAgentMemory(p)).toBe(false)
    expect(canUseApiAccess(p)).toBe(false)
    expect(canUseDelegations(p)).toBe(false)
    expect(canUseMarketplaceInstalls(p)).toBe(true)
    expect(canUseMarketplacePublishing(p)).toBe(false)
  })

  it('operator can shield and governance', () => {
    const op = PLAN_DEFAULTS.operator
    expect(canUseCustomShield(op)).toBe(true)
    expect(canUseGovernanceWorkflows(op)).toBe(true)
    expect(canUseFleetControls(op)).toBe(true)
    expect(canUseOrchestration(op)).toBe(false)
    expect(canUseAgentMemory(op)).toBe(true)
    expect(canUseApiAccess(op)).toBe(true)
    expect(canUseDelegations(op)).toBe(true)
    expect(canUsePolicyVersioning(op)).toBe(true)
    expect(canUseMarketplaceInstalls(op)).toBe(true)
    expect(canUseMarketplacePublishing(op)).toBe(false)
  })

  it('team can orchestration and compliance export', () => {
    const t = PLAN_DEFAULTS.team
    expect(canUseConnectGate(t)).toBe(true)
    expect(canUseAgentMemory(t)).toBe(true)
    expect(canUseCustomShield(t)).toBe(true)
    expect(canUseGovernanceWorkflows(t)).toBe(true)
    expect(canUseFleetControls(t)).toBe(true)
    expect(canUseAlertChannels(t, ['webhook'])).toBe(true)
    expect(canUseOrchestration(t)).toBe(true)
    expect(canUseComplianceExport(t)).toBe(true)
    expect(canUseApiAccess(t)).toBe(true)
    expect(canUseDelegations(t)).toBe(true)
    expect(canUsePolicyVersioning(t)).toBe(true)
    expect(canUseMarketplaceInstalls(t)).toBe(true)
    expect(canUseMarketplacePublishing(t)).toBe(true)
  })
})
