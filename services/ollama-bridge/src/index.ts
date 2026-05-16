import type { ActionRequest, RiskAssessment, RiskLevel } from '@sanctum-runtime/sdk'

export type OllamaBridgeOptions = {
  baseUrl?: string
  model?: string
  timeoutMs?: number
}

export type AnalyzeResult = {
  assessment: RiskAssessment | null
  error?: string
}

export class OllamaBridge {
  private baseUrl: string
  private model: string
  private timeoutMs: number

  constructor(options: OllamaBridgeOptions = {}) {
    const baseUrl = options.baseUrl ?? process.env.OLLAMA_URL
    if (!baseUrl) {
      throw new Error('OllamaBridge requires baseUrl or OLLAMA_URL in environment (.env)')
    }
    this.baseUrl = baseUrl.replace(/\/$/, '')
    const model = options.model ?? process.env.OLLAMA_MODEL
    if (!model) {
      throw new Error('OllamaBridge requires model option or OLLAMA_MODEL in environment (.env)')
    }
    this.model = model
    this.timeoutMs = options.timeoutMs ?? 120_000
  }

  getBaseUrl(): string {
    return this.baseUrl
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

  getModel(): string {
    return this.model
  }

  async analyzeAction(request: ActionRequest): Promise<AnalyzeResult> {
    const contextStr = JSON.stringify(request.context)
    const prompt = `You are Sanctum, runtime trust infrastructure for autonomous AI systems (agents, robotics, automation).
Evaluate REAL-WORLD harm if this action executes. Unlocking doors, alarms, or payments while owners sleep or at night is usually HIGH risk.
Return JSON only:
{"risk":"low|medium|high","reason":"brief explanation","recommendation":"approve|block|require_verification","confidence":0.0}

Actor: ${request.actor}
Action: ${request.action}
Context: ${contextStr}`

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

function parseRiskAssessment(text: string): RiskAssessment | null {
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
