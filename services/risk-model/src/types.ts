import type { ActionRequest } from '@sanctum-runtime/sdk'
import type { AnalyzeResult, RiskPromptOptions } from './parse.js'

export type RiskProviderId = 'ollama' | 'openai'

export type RiskModelInfo = {
  provider: RiskProviderId
  model: string
  endpoint: string
}

export interface RiskModelProvider {
  readonly providerId: RiskProviderId
  getInfo(): RiskModelInfo
  isConnected(): Promise<boolean>
  analyzeAction(
    request: ActionRequest,
    options?: RiskPromptOptions,
  ): Promise<AnalyzeResult>
}
