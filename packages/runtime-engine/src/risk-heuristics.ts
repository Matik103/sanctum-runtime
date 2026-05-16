import type { ActionRequest, RiskLevel } from '@sanctum-runtime/sdk'

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 }

/** Minimum risk from rules — Sanctum must not trust a small model to under-rate physical access. */
export function heuristicRiskFloor(
  request: ActionRequest,
  anomalyFlags: string[],
): RiskLevel {
  if (
    anomalyFlags.includes('unsafe_command_chain') ||
    anomalyFlags.includes('suspicious_prompt_pattern')
  ) {
    return 'high'
  }

  if (request.action === 'unlock_door') {
    const nightAccess = anomalyFlags.includes('unusual_time_access')
    const ownerVulnerable = anomalyFlags.includes('owner_absent_or_sleeping')
    if (nightAccess && ownerVulnerable) {
      return 'high'
    }
    if (nightAccess || ownerVulnerable) {
      return 'high'
    }
  }

  if (request.action === 'disable_alarm' || request.action === 'transfer_funds') {
    if (anomalyFlags.length > 0) return 'high'
  }

  if (anomalyFlags.includes('high_value_transfer')) {
    return 'high'
  }

  if (anomalyFlags.length > 0) {
    return 'medium'
  }

  return 'low'
}

export function mergeRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b
}

export function heuristicRiskReason(
  request: ActionRequest,
  anomalyFlags: string[],
  floor: RiskLevel,
): string | null {
  if (floor === 'low') return null
  if (request.action === 'unlock_door' && floor === 'high') {
    if (
      anomalyFlags.includes('unusual_time_access') &&
      anomalyFlags.includes('owner_absent_or_sleeping')
    ) {
      return 'Physical access (unlock) at night while the owner is asleep is high risk — humanoid or agent must not bypass human verification.'
    }
    return 'Physical access action elevated to high risk by Sanctum heuristics.'
  }
  return `Heuristic minimum risk: ${floor} (${anomalyFlags.join(', ')}).`
}
