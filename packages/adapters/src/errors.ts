export class SanctumBlockedError extends Error {
  readonly action: string
  readonly decision: 'BLOCKED'
  readonly anomalyFlags: string[]
  readonly riskScore: number | null

  constructor(opts: {
    action: string
    anomalyFlags: string[]
    riskScore: number | null
    reasoning?: string
  }) {
    super(
      `Sanctum blocked action "${opts.action}"${opts.reasoning ? `: ${opts.reasoning}` : ''}`,
    )
    this.name = 'SanctumBlockedError'
    this.action = opts.action
    this.decision = 'BLOCKED'
    this.anomalyFlags = opts.anomalyFlags
    this.riskScore = opts.riskScore
  }
}

export class SanctumVerificationTimeoutError extends Error {
  readonly action: string
  readonly correlationId: string

  constructor(action: string, correlationId: string, timeoutMs?: number) {
    super(
      `Sanctum verification timed out for action "${action}" (correlationId: ${correlationId})${timeoutMs != null ? ` after ${timeoutMs}ms` : ''}`,
    )
    this.name = 'SanctumVerificationTimeoutError'
    this.action = action
    this.correlationId = correlationId
  }
}
