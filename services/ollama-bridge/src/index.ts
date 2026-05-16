import { OllamaRiskProvider, type AnalyzeResult, type RiskPromptOptions } from '@sanctum/risk-model'
import type { ActionRequest } from '@sanctum-runtime/sdk'

export type { AnalyzeResult }

export type OllamaBridgeOptions = {
  baseUrl?: string
  model?: string
  timeoutMs?: number
}

/** @deprecated Prefer {@link OllamaRiskProvider} from `@sanctum/risk-model`. */
export class OllamaBridge {
  private inner: OllamaRiskProvider

  constructor(options: OllamaBridgeOptions = {}) {
    this.inner = new OllamaRiskProvider(options)
  }

  getBaseUrl(): string {
    return this.inner.getInfo().endpoint
  }

  getModel(): string {
    return this.inner.getInfo().model
  }

  isConnected(): Promise<boolean> {
    return this.inner.isConnected()
  }

  analyzeAction(request: ActionRequest, options?: RiskPromptOptions): Promise<AnalyzeResult> {
    return this.inner.analyzeAction(request, options)
  }
}

export { OllamaRiskProvider } from '@sanctum/risk-model'
