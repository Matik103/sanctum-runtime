import type { ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from './types.js'
import type { VerificationStatus } from './verification.js'

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

  getBaseUrl(): string {
    return this.baseUrl
  }

  getApiKey(): string | undefined {
    return this.apiKey
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: await this.headers(body != null),
      body: body != null ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      throw new Error(`Sanctum ${method} ${path} failed: ${res.status} ${await res.text()}`)
    }
    if (res.status === 204 || !res.headers.get('content-length')) {
      return undefined as T
    }
    const text = await res.text()
    return text ? (JSON.parse(text) as T) : (undefined as T)
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

  async createPolicy(
    action: string,
    patch: Partial<PolicyMap[string]> = {},
  ): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({ action, ...patch }),
    })
    if (!res.ok) throw new Error(`Sanctum policy create failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async deletePolicy(action: string): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies/${encodeURIComponent(action)}`, {
      method: 'DELETE',
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum policy delete failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async exportPoliciesYaml(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/policies/export.yaml`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum policy export failed: ${res.status}`)
    return res.text()
  }

  async importPoliciesYaml(yaml: string, merge = true): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies/import.yaml`, {
      method: 'POST',
      headers: await this.headers(),
      body: JSON.stringify({ yaml, merge }),
    })
    if (!res.ok) throw new Error(`Sanctum policy import failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async getWebhookStatus(): Promise<{
    configured: boolean
    urlCount: number
    events: string[]
  }> {
    const res = await fetch(`${this.baseUrl}/v1/webhooks/status`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum webhook status failed: ${res.status}`)
    return res.json() as Promise<{ configured: boolean; urlCount: number; events: string[] }>
  }

  async getStatus(): Promise<RuntimeStatus> {
    const res = await fetch(`${this.baseUrl}/v1/status`, {
      headers: await this.headers(false),
    })
    if (!res.ok) throw new Error(`Sanctum status failed: ${res.status}`)
    return res.json() as Promise<RuntimeStatus>
  }

  async getVerificationStatus(correlationId: string): Promise<VerificationStatus> {
    const res = await fetch(
      `${this.baseUrl}/v1/verifications/${encodeURIComponent(correlationId)}`,
      { headers: await this.headers(false) },
    )
    if (!res.ok) throw new Error(`Sanctum verification status failed: ${res.status}`)
    return res.json() as Promise<VerificationStatus>
  }

  async waitForVerification(
    correlationId: string,
    options: { timeoutMs?: number; pollIntervalMs?: number } = {},
  ): Promise<VerificationStatus> {
    const timeoutMs = options.timeoutMs ?? 120_000
    const pollIntervalMs = options.pollIntervalMs ?? 2_000
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const status = await this.getVerificationStatus(correlationId)
      if (status.status === 'approved' || status.status === 'blocked') {
        return status
      }
      if (status.status === 'not_found') {
        throw new Error(`No audit entry for correlationId ${correlationId}`)
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs))
    }

    throw new Error(`Verification timed out after ${timeoutMs}ms (${correlationId})`)
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
