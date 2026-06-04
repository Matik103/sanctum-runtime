import { describe, expect, it } from 'vitest'
import { PLAN_DEFAULTS } from './entitlements.js'
import {
  canEvaluateShieldRules,
  canUseComplianceExport,
  canUseConnectGate,
  canUseCustomShield,
  canUseFleetControls,
  canApproveHolds,
  canUseAlertChannels,
  canUseGovernanceWorkflows,
  canUseOrchestration,
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
  })

  it('operator can shield and governance', () => {
    const op = PLAN_DEFAULTS.operator
    expect(canUseCustomShield(op)).toBe(true)
    expect(canUseGovernanceWorkflows(op)).toBe(true)
    expect(canUseFleetControls(op)).toBe(true)
    expect(canUseOrchestration(op)).toBe(false)
  })

  it('team can orchestration and compliance export', () => {
    const t = PLAN_DEFAULTS.team
    expect(canUseOrchestration(t)).toBe(true)
    expect(canUseComplianceExport(t)).toBe(true)
  })
})
