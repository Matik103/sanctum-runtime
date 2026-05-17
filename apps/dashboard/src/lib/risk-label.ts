import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'

/** Sidebar / status copy for connected risk provider (no heuristic-fallback messaging). */
export function riskModelStatusLine(status: RuntimeStatus | null): {
  dot: 'ok' | 'warn'
  label: string
} {
  if (!status) {
    return { dot: 'warn', label: 'Connecting…' }
  }

  const connected = status.riskModelConnected ?? status.ollamaConnected ?? false
  const provider = status.riskProvider ?? (status.ollamaConnected ? 'ollama' : 'none')
  const model = status.riskModel ?? status.ollamaModel

  if (connected && provider === 'openai') {
    return { dot: 'ok', label: model ? `OpenAI · ${model}` : 'OpenAI connected' }
  }
  if (connected && provider === 'ollama') {
    return { dot: 'ok', label: model ? `Ollama · ${model}` : 'Ollama connected' }
  }
  if (connected) {
    return { dot: 'ok', label: model ? `Risk model · ${model}` : 'Risk model connected' }
  }
  if (provider === 'none') {
    return { dot: 'ok', label: 'Offline mode · heuristics only' }
  }
  if (provider === 'openai') {
    return { dot: 'warn', label: 'OpenAI disconnected' }
  }
  if (provider === 'ollama') {
    return { dot: 'warn', label: 'Ollama offline' }
  }
  return { dot: 'warn', label: 'Configure risk model (OPENAI or OLLAMA)' }
}

export function riskModelMetaLine(status: RuntimeStatus | null): string {
  if (!status) return '—'
  const provider = status.riskProvider ?? 'none'
  const model = status.riskModel ?? status.ollamaModel
  if (provider === 'openai') return model ? `OpenAI · ${model}` : 'OpenAI'
  if (provider === 'ollama') return model ? `Ollama · ${model}` : 'Ollama'
  if (provider === 'none') return 'Offline mode · heuristics only'
  if (model) return model
  return 'Risk model not configured'
}

export function auditInferenceLabel(entry: { modelInvoked?: boolean }): string {
  return entry.modelInvoked ? 'AI model' : 'Policy'
}
