import type { ActionResult, Decision, EvaluationMode, RiskLevel } from '@sanctum/runtime'
import { evaluationModeLabel } from '@sanctum/runtime'

export function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export function decisionTone(decision: Decision): 'success' | 'warning' | 'danger' {
  if (decision === 'APPROVED') return 'success'
  if (decision === 'REQUIRE_VERIFICATION') return 'warning'
  return 'danger'
}

export function riskTone(risk: RiskLevel): 'low' | 'medium' | 'high' {
  return risk
}

export function inferenceLabel(e: ActionResult): string {
  if (e.evaluationMode) return evaluationModeLabel(e.evaluationMode)
  return e.offlineMode ? 'Offline' : 'Online'
}

export function resolveMode(e: ActionResult): EvaluationMode {
  if (e.evaluationMode) return e.evaluationMode
  return e.offlineMode ? 'offline_forced' : 'offline_model_failed'
}
