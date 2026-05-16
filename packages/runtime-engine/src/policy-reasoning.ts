import type {
  ActionPolicy,
  ActionRequest,
  Decision,
  EvaluationMode,
  RiskLevel,
} from '@sanctum-runtime/sdk'

function humanizeAction(action: string): string {
  return action.replace(/[:_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function policyModeLabel(policy: ActionPolicy): 'Approve' | 'Verify' | 'Block' {
  if (policy.autoBlock) return 'Block'
  if (policy.requiresVerification) return 'Verify'
  return 'Approve'
}

export function formatAnomalyFlags(flags: string[]): string {
  if (!flags.length) return ''
  const labels = flags.map((f) =>
    f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  )
  return `Context signals: ${labels.join(', ')}.`
}

/** Plain-language reasoning tied to the named policy, not generic "heuristic" copy. */
export function buildPolicyReasoning(options: {
  request: ActionRequest
  policy: ActionPolicy
  policyPath: string
  decision: Decision
  anomalyFlags: string[]
  evaluationMode: EvaluationMode
  risk: RiskLevel
  modelReason?: string
}): string {
  const { request, policy, decision, anomalyFlags, evaluationMode, risk } = options
  const actionName = humanizeAction(request.action)
  const mode = policyModeLabel(policy)
  const parts: string[] = []

  parts.push(
    `Policy for "${request.action}" (${mode}): ${actionName} was evaluated at ${risk} risk.`,
  )

  if (policy.riskPrompt?.trim()) {
    parts.push('Custom risk instructions from this policy were applied.')
  }

  const anomaly = formatAnomalyFlags(anomalyFlags)
  if (anomaly) parts.push(anomaly)

  if (options.modelReason?.trim()) {
    parts.push(options.modelReason.trim())
  } else if (evaluationMode === 'offline_forced') {
    parts.push('Sanctum policy rules applied (offline mode — no risk model call).')
  } else if (evaluationMode === 'offline_no_ollama') {
    parts.push('Sanctum policy rules applied (risk model unavailable).')
  } else if (evaluationMode === 'offline_model_failed') {
    parts.push('Risk model call failed; Sanctum policy rules decided the outcome.')
  }

  if (decision === 'REQUIRE_VERIFICATION') {
    parts.push('Human approval is required before this action can execute.')
  } else if (decision === 'BLOCKED') {
    parts.push('This action was denied and must not execute.')
  } else {
    parts.push('This action is cleared to proceed.')
  }

  return parts.join(' ')
}
