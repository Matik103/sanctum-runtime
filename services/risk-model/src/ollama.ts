import type { ActionRequest } from '@sanctum-runtime/sdk'
import {
  buildRiskPrompt,
  parseRiskAssessment,
  type AnalyzeResult,
  type RiskPromptOptions,
} from './parse.js'
import type { RiskModelInfo, RiskModelProvider } from './types.js'

export type OllamaRiskProviderOptions = {
  baseUrl?: string
  model?: string
  timeoutMs?: number
}

export class OllamaRiskProvider implements RiskModelProvider {
  readonly providerId = 'ollama' as const
  private baseUrl: string
  private model: string
  private timeoutMs: number

  constructor(options: OllamaRiskProviderOptions = {}) {
    const baseUrl = options.baseUrl ?? process.env.OLLAMA_URL
    if (!baseUrl) {
      throw new Error('Ollama provider requires baseUrl or OLLAMA_URL in environment (.env)')
    }
    this.baseUrl = baseUrl.replace(/\/$/, '')
    const model =
      options.model ?? process.env.SANCTUM_RISK_MODEL ?? process.env.OLLAMA_MODEL
    if (!model) {
      throw new Error(
        'Ollama provider requires model, SANCTUM_RISK_MODEL, or OLLAMA_MODEL in environment',
      )
    }
    this.model = model
    this.timeoutMs = options.timeoutMs ?? 120_000
  }

  getInfo(): RiskModelInfo {
    return { provider: 'ollama', model: this.model, endpoint: this.baseUrl }
  }

  async isConnected(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return false
      const data = (await res.json()) as { models?: { name: string }[] }
      const names = data.models?.map((m) => m.name) ?? []
      return names.some(
        (n) => n === this.model || n === `${this.model}:latest` || n.startsWith(`${this.model}:`),
      )
    } catch {
      return false
    }
  }

  async analyzeAction(
    request: ActionRequest,
    options: RiskPromptOptions = {},
  ): Promise<AnalyzeResult> {
    const prompt = buildRiskPrompt(request, options)

    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.1, num_predict: 150 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!res.ok) {
        const errText = await res.text()
        return { assessment: null, error: `Ollama HTTP ${res.status}: ${errText.slice(0, 120)}` }
      }

      const data = (await res.json()) as { response?: string }
      const assessment = parseRiskAssessment(data.response ?? '')
      if (!assessment) {
        return {
          assessment: null,
          error: `Could not parse model JSON: ${(data.response ?? '').slice(0, 80)}`,
        }
      }
      return { assessment }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return { assessment: null, error: `Ollama call failed: ${msg}` }
    }
  }
}
