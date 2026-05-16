import type { ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from './types.js'

export type SanctumClientOptions = {
  baseUrl?: string
  offlineMode?: boolean
  /** Sent as X-Sanctum-Key when SANCTUM_API_KEY is configured on the server. */
  apiKey?: string
  /** Supabase session access token → Authorization: Bearer (dashboard). */
  getAccessToken?: () => Promise<string | undefined>
}

export class SanctumClient {
  private baseUrl: string
  private offlineMode: boolean
  private apiKey?: string
  private getAccessToken?: () => Promise<string | undefined>

  constructor(options: SanctumClientOptions = {}) {
    const fromEnv =
      typeof process !== 'undefined' ? process.env.SANCTUM_API_URL : undefined
    const base = options.baseUrl ?? fromEnv
    if (!base) {
      throw new Error(
        'SanctumClient requires baseUrl (or SANCTUM_API_URL in Node). Copy .env.example → .env and set your API URL.',
      )
    }
    this.baseUrl = base.replace(/\/$/, '')
    this.offlineMode = options.offlineMode ?? false
    this.apiKey =
      options.apiKey ??
      (typeof process !== 'undefined' ? process.env.SANCTUM_API_KEY : undefined)
    this.getAccessToken = options.getAccessToken
  }

  private async headers(json = true): Promise<HeadersInit> {
    const h: Record<string, string> = {}
    if (json) h['Content-Type'] = 'application/json'
    const token = this.getAccessToken ? await this.getAccessToken() : undefined
    if (token) h['Authorization'] = `Bearer ${token}`
    else if (this.apiKey) h['X-Sanctum-Key'] = this.apiKey
    return h
  }

  async verifyAction(
    request: ActionRequest,
    options: { offlineMode?: boolean; correlationId?: string } = {},
  ): Promise<ActionResult> {
    const res = await fetch(`${this.baseUrl}/v1/actions/verify`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({
        ...request,
        offlineMode: options.offlineMode ?? this.offlineMode,
        correlationId: options.correlationId,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Sanctum verify failed: ${res.status} ${err}`)
    }
    return res.json() as Promise<ActionResult>
  }

  async getAudit(limit = 50): Promise<ActionResult[]> {
    const res = await fetch(`${this.baseUrl}/v1/audit?limit=${limit}`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum audit failed: ${res.status}`)
    return res.json() as Promise<ActionResult[]>
  }

  async getPolicies(): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum policies failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async updatePolicy(action: string, patch: Partial<PolicyMap[string]>): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies/${encodeURIComponent(action)}`, {
      method: 'PATCH',
      headers: await this.headers(),
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`Sanctum policy update failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async getStatus(): Promise<RuntimeStatus> {
    const res = await fetch(`${this.baseUrl}/v1/status`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum status failed: ${res.status}`)
    return res.json() as Promise<RuntimeStatus>
  }

  async resolveAuditEntry(
    id: string,
    body: {
      decision: 'APPROVED' | 'BLOCKED'
      resolvedBy?: string
      note?: string
    },
  ): Promise<ActionResult> {
    const res = await fetch(`${this.baseUrl}/v1/audit/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Sanctum resolve failed: ${res.status} ${err}`)
    }
    return res.json() as Promise<ActionResult>
  }
}
