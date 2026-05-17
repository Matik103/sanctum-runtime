export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export class CircuitOpenError extends Error {
  readonly isCircuitOpen = true

  constructor(name: string) {
    super(`Circuit breaker '${name}' is OPEN — rejecting call`)
    this.name = 'CircuitOpenError'
  }
}

export type CircuitBreakerOptions = {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number
  /** Number of consecutive successes in HALF_OPEN before closing */
  successThreshold: number
  /** Milliseconds to stay OPEN before transitioning to HALF_OPEN */
  timeout: number
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private failures = 0
  private successes = 0
  private lastFailure: Date | null = null
  private openedAt: number | null = null

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if we should transition to HALF_OPEN
      if (
        this.openedAt !== null &&
        Date.now() - this.openedAt >= this.options.timeout
      ) {
        this.transitionTo('HALF_OPEN')
      } else {
        throw new CircuitOpenError(this.name)
      }
    }

    if (this.state === 'HALF_OPEN') {
      // Allow exactly one probe call through at a time
      try {
        const result = await fn()
        this.onSuccess()
        return result
      } catch (err) {
        this.onFailure()
        throw err
      }
    }

    // CLOSED state — normal operation
    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure()
      throw err
    }
  }

  getState(): CircuitBreakerState {
    // Lazily re-evaluate OPEN → HALF_OPEN transition when state is queried
    if (
      this.state === 'OPEN' &&
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.options.timeout
    ) {
      this.transitionTo('HALF_OPEN')
    }
    return this.state
  }

  getStats(): {
    failures: number
    successes: number
    state: CircuitBreakerState
    lastFailure: Date | null
  } {
    return {
      failures: this.failures,
      successes: this.successes,
      state: this.getState(),
      lastFailure: this.lastFailure,
    }
  }

  private onSuccess(): void {
    this.lastFailure = null

    if (this.state === 'HALF_OPEN') {
      this.successes++
      if (this.successes >= this.options.successThreshold) {
        this.transitionTo('CLOSED')
      }
    } else {
      // Reset failure counter on any success in CLOSED state
      this.failures = 0
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailure = new Date()

    if (this.state === 'HALF_OPEN') {
      // Single failure in HALF_OPEN re-opens the circuit
      this.transitionTo('OPEN')
    } else if (
      this.state === 'CLOSED' &&
      this.failures >= this.options.failureThreshold
    ) {
      this.transitionTo('OPEN')
    }
  }

  private transitionTo(next: CircuitBreakerState): void {
    this.state = next
    if (next === 'OPEN') {
      this.openedAt = Date.now()
      this.successes = 0
    } else if (next === 'HALF_OPEN') {
      this.successes = 0
    } else if (next === 'CLOSED') {
      this.failures = 0
      this.successes = 0
      this.openedAt = null
    }
  }
}

/** Shared circuit breaker for risk model calls */
export const riskModelBreaker = new CircuitBreaker('risk-model', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60_000,
})
