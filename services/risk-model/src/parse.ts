import type { RiskAssessment, RiskLevel } from '@sanctum-runtime/sdk'

export type AnalyzeResult = {
  assessment: RiskAssessment | null
  error?: string
}

const JSON_FOOTER = `Return JSON only:
{"risk":"low|medium|high","reason":"brief explanation","recommendation":"approve|block|require_verification","confidence":0.0}`

export type RiskPromptOptions = {
  /** Per-action override from policy (instructions for the risk model). */
  riskPrompt?: string
}

export function buildRiskPrompt(
  request: {
    actor: string
    action: string
    context: Record<string, unknown>
  },
  options: RiskPromptOptions = {},
): string {
  const contextStr = JSON.stringify(request.context)
  const body = options.riskPrompt?.trim()
    ? `${options.riskPrompt.trim()}

Actor: ${request.actor}
Action: ${request.action}
Context: ${contextStr}`
    : `You are Sanctum, runtime trust infrastructure for autonomous AI systems (agents, robotics, automation).
Evaluate REAL-WORLD harm if this action executes. Unlocking doors, alarms, or payments while owners sleep or at night is usually HIGH risk.

Actor: ${request.actor}
Action: ${request.action}
Context: ${contextStr}`

  return `${body}

${JSON_FOOTER}`
}

export function parseRiskAssessment(text: string): RiskAssessment | null {
  const trimmed = text.trim()
  try {
    return normalizeAssessment(JSON.parse(trimmed) as Record<string, unknown>)
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return normalizeAssessment(JSON.parse(match[0]) as Record<string, unknown>)
    } catch {
      return null
    }
  }
}

function normalizeAssessment(raw: Record<string, unknown>): RiskAssessment {
  const risk = normalizeRisk(String(raw.risk ?? 'medium'))
  const recommendation = normalizeRecommendation(String(raw.recommendation ?? 'require_verification'))
  return {
    risk,
    reason: String(raw.reason ?? 'Model risk assessment'),
    recommendation,
    confidence:
      typeof raw.confidence === 'number'
        ? Math.min(1, Math.max(0, raw.confidence))
        : undefined,
  }
}

function normalizeRisk(value: string): RiskLevel {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return 'medium'
}

function normalizeRecommendation(
  value: string,
): RiskAssessment['recommendation'] {
  if (value === 'approve' || value === 'block' || value === 'require_verification') {
    return value
  }
  return 'require_verification'
}
