import type { SanctumClient } from './client.js'

export type RuntimeMode = 'cloud' | 'edge' | 'airgap' | 'hybrid'

export type ConnectOptions = {
  runtimeName: string
  organizationId: string
  mode?: RuntimeMode
  fingerprint?: string
  metadata?: Record<string, unknown>
  telemetry?: Record<string, unknown>
  activeModel?: string
  currentTask?: string
  heartbeatIntervalMs?: number
}

export type ConnectResult = {
  runtimeId: string
  organizationId: string
  status: string
  trustScore: number
  connectedAt: string | null
}

export type RegisterAgentOptions = {
  id: string
  model?: string
  permissions?: string[]
  metadata?: Record<string, unknown>
}

export class ControlPlaneSession {
  runtimeId: string | null = null
  organizationId: string | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(private client: SanctumClient) {}

  get connected(): boolean {
    return Boolean(this.runtimeId)
  }

  async connect(options: ConnectOptions): Promise<ConnectResult> {
    const result = await this.client.request<ConnectResult>('POST', '/v1/runtimes/connect', {
      runtimeName: options.runtimeName,
      organizationId: options.organizationId,
      mode: options.mode ?? 'cloud',
      fingerprint: options.fingerprint,
      metadata: options.metadata,
      telemetry: options.telemetry,
      activeModel: options.activeModel,
      currentTask: options.currentTask,
    })

    this.runtimeId = result.runtimeId
    this.organizationId = result.organizationId

    this.startHeartbeat(options.heartbeatIntervalMs ?? 30_000, {
      telemetry: options.telemetry,
      activeModel: options.activeModel,
      currentTask: options.currentTask,
    })

    return result
  }

  startHeartbeat(
    intervalMs: number,
    patch?: { telemetry?: Record<string, unknown>; activeModel?: string; currentTask?: string },
  ) {
    this.stopHeartbeat()
    if (!this.runtimeId) return
    const id = this.runtimeId
    const tick = () => {
      void this.client
        .request('POST', `/v1/runtimes/${id}/heartbeat`, {
          telemetry: patch?.telemetry,
          activeModel: patch?.activeModel,
          currentTask: patch?.currentTask,
          status: 'online',
        })
        .catch(() => {})
    }
    tick()
    this.heartbeatTimer = setInterval(tick, intervalMs)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  async disconnect() {
    this.stopHeartbeat()
    if (this.runtimeId) {
      await this.client
        .request('POST', `/v1/runtimes/${this.runtimeId}/heartbeat`, { status: 'offline' })
        .catch(() => {})
    }
    this.runtimeId = null
    this.organizationId = null
  }

  async registerAgent(options: RegisterAgentOptions) {
    if (!this.runtimeId) throw new Error('Call connect() before registerAgent()')
    return this.client.request('POST', `/v1/runtimes/${this.runtimeId}/agents`, {
      id: options.id,
      model: options.model,
      permissions: options.permissions,
      metadata: options.metadata,
    })
  }

  async emitEvent(eventType: string, payload?: Record<string, unknown>, agentId?: string) {
    if (!this.runtimeId) throw new Error('Call connect() before emitEvent()')
    return this.client.request('POST', `/v1/runtimes/${this.runtimeId}/events`, {
      eventType,
      payload,
      agentId,
      organizationId: this.organizationId,
    })
  }

  listRuntimes(orgId?: string) {
    const q = orgId ? `?org_id=${encodeURIComponent(orgId)}` : ''
    return this.client.request<unknown[]>('GET', `/v1/runtimes${q}`)
  }

  listEvents(orgId?: string, limit = 100) {
    const params = new URLSearchParams()
    if (orgId) params.set('org_id', orgId)
    params.set('limit', String(limit))
    return this.client.request<unknown[]>('GET', `/v1/events?${params}`)
  }
}
