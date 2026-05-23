import type { ActionRequest } from '@sanctum-runtime/sdk'
import {
  buildRiskPrompt,
  parseRiskAssessment,
  type AnalyzeResult,
  type RiskPromptOptions,
} from './parse.js'
import type { RiskModelInfo, RiskModelProvider } from './types.js'

export type OpenAICompatibleRiskProviderOptions = {
  baseUrl?: string
  apiKey?: string
  model?: string
  timeoutMs?: number
}

/** OpenAI-compatible chat API (OpenAI, vLLM, LiteLLM, Groq, Together, local gateways). */
export class OpenAICompatibleRiskProvider implements RiskModelProvider {
  readonly providerId = 'openai' as const
  private baseUrl: string
  private apiKey: string
  private model: string
  private timeoutMs: number

  constructor(options: OpenAICompatibleRiskProviderOptions = {}) {
    const baseUrl =
      options.baseUrl ??
      process.env.OPENAI_BASE_URL ??
      process.env.SANCTUM_RISK_BASE_URL ??
      'https://api.openai.com/v1'
    this.baseUrl = baseUrl.replace(/\/$/, '')
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY
    if (!apiKey?.trim()) {
      throw new Error(
        'OpenAI-compatible provider requires apiKey or OPENAI_API_KEY in environment',
      )
    }
    this.apiKey = apiKey.trim()
    // Default to gpt-4o-mini — fast, cheap, well-suited for JSON risk assessments.
    // Override via SANCTUM_RISK_MODEL or OPENAI_MODEL env var.
    const model =
      options.model ?? process.env.SANCTUM_RISK_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    this.model = model
    const configuredTimeout = Number(process.env.SANCTUM_RISK_TIMEOUT_MS)
    const defaultTimeout = Number.isFinite(configuredTimeout) && configuredTimeout >= 500
      ? configuredTimeout
      : 8_000
    this.timeoutMs = options.timeoutMs ?? defaultTimeout
  }

  getInfo(): RiskModelInfo {
    return { provider: 'openai', model: this.model, endpoint: this.baseUrl }
  }

  async isConnected(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return Boolean(this.apiKey)
      const data = (await res.json()) as { data?: { id: string }[] }
      const ids = data.data?.map((m) => m.id) ?? []
      return ids.length === 0 || ids.some((id) => id === this.model || id.startsWith(this.model))
    } catch {
      return Boolean(this.apiKey)
    }
  }

  async analyzeAction(
    request: ActionRequest,
    options: RiskPromptOptions = {},
  ): Promise<AnalyzeResult> {
    const userPrompt = buildRiskPrompt(request, options)

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content:
                'You assess physical-world risk for autonomous AI actions. Reply with JSON only.',
            },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 200,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          assessment: null,
          error: `Risk model HTTP ${res.status}: ${errText.slice(0, 120)}`,
        }
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[]
      }
      const content = data.choices?.[0]?.message?.content ?? ''
      const assessment = parseRiskAssessment(content)
      if (!assessment) {
        return {
          assessment: null,
          error: `Could not parse model JSON: ${content.slice(0, 80)}`,
        }
      }
      return { assessment }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return { assessment: null, error: `Risk model call failed: ${msg}` }
    }
  }
}
