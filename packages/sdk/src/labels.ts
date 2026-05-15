import type { ActionResult, EvaluationMode } from './types.js'

export function evaluationModeLabel(mode: EvaluationMode): string {
  switch (mode) {
    case 'online_model':
      return 'Online · model used'
    case 'offline_forced':
      return 'Offline · forced (no model)'
    case 'offline_no_ollama':
      return 'Offline · Ollama down'
    case 'offline_model_failed':
      return 'Online · model failed → heuristics'
  }
}

export function formatDemoResult(result: ActionResult): string {
  const mode = evaluationModeLabel(result.evaluationMode)
  const model = result.modelInvoked ? 'Qwen invoked' : 'No model call'
  return `${mode} · ${model}\n${result.decision}: ${result.reasoning}`
}
