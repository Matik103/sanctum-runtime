import type { RuntimeStatus } from '@sanctum-runtime/sdk/browser'

/** Sidebar / status copy for connected risk provider (no heuristic-fallback messaging). */
export function riskModelStatusLine(status: RuntimeStatus | null): {
  dot: 'ok' | 'warn'
  label: string
  detail?: string
} {
  if (!status) {
    return { dot: 'warn', label: 'Connecting…' }
  }

  const connected = status.riskModelConnected ?? status.ollamaConnected ?? false
  const provider = status.riskProvider ?? (status.ollamaConnected ? 'ollama' : 'none')

  if (connected) {
    return { dot: 'ok', label: 'Risk scoring', detail: riskModelMetaLine(status) }
  }
  if (provider === 'none') {
    return { dot: 'ok', label: 'Policy scoring active', detail: 'Offline mode · heuristics only' }
  }
  if (provider === 'openai') {
    return { dot: 'warn', label: 'Risk scoring', detail: 'Provider disconnected' }
  }
  if (provider === 'ollama') {
    return { dot: 'warn', label: 'Risk scoring', detail: 'Provider offline' }
  }
  return { dot: 'warn', label: 'Risk scoring not configured' }
}

export function riskModelMetaLine(status: RuntimeStatus | null): string {
  if (!status) return '—'
  const provider = status.riskProvider ?? 'none'
  const connected = status.riskModelConnected ?? status.ollamaConnected ?? false
  if (provider === 'none') return 'Policy scoring online'
  if (connected) return 'Risk scoring online'
  if (provider === 'openai' || provider === 'ollama') return 'Risk scoring offline'
  return 'Risk scoring not configured'
}

export function auditInferenceLabel(entry: { modelInvoked?: boolean }): string {
  return entry.modelInvoked ? 'AI model' : 'Policy'
}
