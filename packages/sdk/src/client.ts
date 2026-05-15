import type { ActionRequest, ActionResult, PolicyMap, RuntimeStatus } from './types.js'

export type SanctumClientOptions = {
  baseUrl?: string
  offlineMode?: boolean
}

export class SanctumClient {
  private baseUrl: string
  private offlineMode: boolean

  constructor(options: SanctumClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:3001'
    this.offlineMode = options.offlineMode ?? false
  }

  async verifyAction(
    request: ActionRequest,
    options: { offlineMode?: boolean; correlationId?: string } = {},
  ): Promise<ActionResult> {
    const res = await fetch(`${this.baseUrl}/v1/actions/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${this.baseUrl}/v1/audit?limit=${limit}`)
    if (!res.ok) throw new Error(`Sanctum audit failed: ${res.status}`)
    return res.json() as Promise<ActionResult[]>
  }

  async getPolicies(): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies`)
    if (!res.ok) throw new Error(`Sanctum policies failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async updatePolicy(action: string, patch: Partial<PolicyMap[string]>): Promise<PolicyMap> {
    const res = await fetch(`${this.baseUrl}/v1/policies/${encodeURIComponent(action)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) throw new Error(`Sanctum policy update failed: ${res.status}`)
    return res.json() as Promise<PolicyMap>
  }

  async getStatus(): Promise<RuntimeStatus> {
    const res = await fetch(`${this.baseUrl}/v1/status`)
    if (!res.ok) throw new Error(`Sanctum status failed: ${res.status}`)
    return res.json() as Promise<RuntimeStatus>
  }
}
