import type { ActionPolicy, Decision, RiskLevel } from '@sanctum/sdk'

/** Policy Manager controls hard blocks; model can only require verification unless Block is on. */
export function resolveDecision(options: {
  policy: ActionPolicy
  risk: RiskLevel
  modelRecommendation?: 'approve' | 'block' | 'require_verification'
  anomalyFlags: string[]
}): Decision {
  const { policy, risk, modelRecommendation, anomalyFlags } = options

  if (policy.autoBlock) {
    return 'BLOCKED'
  }

  if (anomalyFlags.includes('suspicious_prompt_pattern')) {
    return 'BLOCKED'
  }

  if (anomalyFlags.includes('unsafe_command_chain') && policy.autoBlock) {
    return 'BLOCKED'
  }

  if (
    modelRecommendation === 'block' ||
    modelRecommendation === 'require_verification' ||
    policy.requiresVerification ||
    risk === 'high' ||
    risk === 'medium'
  ) {
    if (policy.requiresVerification || modelRecommendation !== 'approve') {
      return 'REQUIRE_VERIFICATION'
    }
  }

  return 'APPROVED'
}

export function decisionReasoningSuffix(
  decision: Decision,
  policy: ActionPolicy,
  modelRecommendation?: string,
): string | null {
  if (decision === 'BLOCKED' && policy.autoBlock) {
    return 'Blocked by Policy Manager (auto-block enabled).'
  }
  if (decision === 'REQUIRE_VERIFICATION' && modelRecommendation === 'block' && !policy.autoBlock) {
    return 'Model suggested block; policy has auto-block off — held for your verification instead.'
  }
  if (decision === 'REQUIRE_VERIFICATION' && policy.requiresVerification) {
    return 'Held per Policy Manager (verify enabled).'
  }
  return null
}
