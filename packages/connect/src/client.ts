export type ConnectVerifyResult = {
  ok: boolean
  decision: string
  entry?: Record<string, unknown>
  actionToken?: string | null
  reasoning?: string
}

export type ConnectClientOptions = {
  apiUrl: string
  agentToken: string
  platform?: string
  waitVerification?: boolean
  waitTimeoutMs?: number
}

export class ConnectExecutionBlocked extends Error {
  constructor(
    message: string,
    readonly decision: string,
    readonly entry?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ConnectExecutionBlocked'
  }
}

/** Lightweight Connect client — uses verify-execution (no full SDK). */
export class ConnectClient {
  constructor(private opts: ConnectClientOptions) {}

  get apiUrl() {
    return this.opts.apiUrl.replace(/\/$/, '')
  }

  async verifyExecution(
    action: string,
    args: Record<string, unknown> = {},
    toolCallId?: string,
  ): Promise<ConnectVerifyResult> {
    const res = await fetch(`${this.apiUrl}/v1/connect/verify-execution`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sanctum-Agent-Token': this.opts.agentToken,
      },
      body: JSON.stringify({
        action,
        arguments: args,
        tool_call_id: toolCallId ?? `exec-${Date.now()}`,
        platform: this.opts.platform ?? 'connect',
        wait_verification: this.opts.waitVerification ?? true,
      }),
    })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new ConnectExecutionBlocked(
        String(body.reasoning ?? body.error ?? 'blocked'),
        String(body.decision ?? 'BLOCKED'),
        body.entry as Record<string, unknown> | undefined,
      )
    }
    return {
      ok: true,
      decision: String(body.decision ?? 'APPROVED'),
      entry: body.entry as Record<string, unknown> | undefined,
      actionToken: (body.actionToken as string | null) ?? null,
    }
  }

  async getVerificationStatus(correlationId: string) {
    const res = await fetch(`${this.apiUrl}/v1/connect/verifications/${encodeURIComponent(correlationId)}`, {
      headers: { 'X-Sanctum-Agent-Token': this.opts.agentToken },
    })
    if (!res.ok) throw new Error(`verification_status_failed:${res.status}`)
    return res.json() as Promise<{ status: string; entry?: Record<string, unknown> }>
  }
}
