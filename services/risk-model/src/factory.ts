import { OllamaRiskProvider } from './ollama.js'
import { OpenAICompatibleRiskProvider } from './openai-compatible.js'
import type { RiskModelProvider } from './types.js'

export type RiskModelFactoryOptions = {
  /** ollama | openai | none — default ollama when OLLAMA_URL is set, else none */
  provider?: string
}

/**
 * Create the configured risk model from environment.
 * Set SANCTUM_RISK_PROVIDER=none to use policy + heuristics only (no LLM calls).
 */
export function createRiskModelFromEnv(
  options: RiskModelFactoryOptions = {},
): RiskModelProvider | null {
  const explicit = (options.provider ?? process.env.SANCTUM_RISK_PROVIDER)?.trim().toLowerCase()

  if (explicit === 'none' || explicit === 'off' || explicit === 'disabled') {
    return null
  }

  if (explicit === 'openai' || explicit === 'openai-compatible') {
    return new OpenAICompatibleRiskProvider()
  }

  if (explicit === 'ollama') {
    return new OllamaRiskProvider()
  }

  // Auto: prefer OpenAI when key is set and provider not forced to ollama
  if (process.env.OPENAI_API_KEY?.trim() && explicit !== 'ollama') {
    try {
      return new OpenAICompatibleRiskProvider()
    } catch {
      /* fall through */
    }
  }

  if (process.env.OLLAMA_URL?.trim()) {
    try {
      return new OllamaRiskProvider()
    } catch {
      return null
    }
  }

  return null
}
