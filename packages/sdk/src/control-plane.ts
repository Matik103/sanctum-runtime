import type { SanctumClient } from './client.js'
import { defaultAttestationReport, type AttestationReport } from './attestation.js'
import { connectRuntimeWebSocket } from './runtime-ws.js'

export type { AttestationReport } from './attestation.js'
export { defaultAttestationReport } from './attestation.js'

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
  /** Host attestation report; defaults to local platform/hostname when omitted. */
  attestation?: AttestationReport
  /** When false, connect without sending attestation (trust score may be lower). */
  attest?: boolean
  deploymentGroupId?: string
  region?: string
  /** Invoked when the control plane delivers a command on heartbeat. */
  onCommand?: (cmd: RuntimeCommand) => void | Promise<void>
  /** Use WebSocket for instant command delivery (default true in Node). */
  useWebSocket?: boolean
}

export type RuntimeCommand = {
  id: string
  command: string
  payload: Record<string, unknown>
}

type HeartbeatResult = {
  ok: boolean
  commands?: RuntimeCommand[]
}

export type ConnectResult = {
  runtimeId: string
  organizationId: string
  status: string
  trustScore: number
  attestationStatus?: string
  attestationToken?: string | null
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
  private onCommand: ((cmd: RuntimeCommand) => void | Promise<void>) | null = null
  private wsDisconnect: (() => void) | null = null

  constructor(private client: SanctumClient) {}

  get connected(): boolean {
    return Boolean(this.runtimeId)
  }

  async connect(options: ConnectOptions): Promise<ConnectResult> {
    const attest = options.attest !== false
    const result = await this.client.request<ConnectResult>('POST', '/v1/runtimes/connect', {
      runtimeName: options.runtimeName,
      organizationId: options.organizationId,
      mode: options.mode ?? 'cloud',
      fingerprint: options.fingerprint,
      metadata: options.metadata,
      telemetry: options.telemetry,
      activeModel: options.activeModel,
      currentTask: options.currentTask,
      attestation: attest ? (options.attestation ?? defaultAttestationReport()) : undefined,
      deploymentGroupId: options.deploymentGroupId,
      region: options.region,
    })

    this.runtimeId = result.runtimeId
    this.organizationId = result.organizationId
    this.onCommand = options.onCommand ?? null

    this.startHeartbeat(options.heartbeatIntervalMs ?? 30_000, {
      telemetry: options.telemetry,
      activeModel: options.activeModel,
      currentTask: options.currentTask,
    })

    const useWs = options.useWebSocket !== false && typeof process !== 'undefined'
    if (useWs) {
      void connectRuntimeWebSocket({
        baseUrl: this.client.getBaseUrl(),
        runtimeId: result.runtimeId,
        apiKey: this.client.getApiKey(),
        onCommand: async (cmd) => {
          if (this.onCommand) await this.onCommand(cmd)
        },
        onAck: (id, ok) => this.ackCommand(id, ok),
      })
        .then((close) => {
          this.wsDisconnect = close
        })
        .catch(() => {
          /* heartbeat fallback */
        })
    }

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
        .request<HeartbeatResult>('POST', `/v1/runtimes/${id}/heartbeat`, {
          telemetry: patch?.telemetry,
          activeModel: patch?.activeModel,
          currentTask: patch?.currentTask,
          status: 'online',
        })
        .then((res) => this.handleHeartbeatCommands(res))
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

  private async handleHeartbeatCommands(res: HeartbeatResult) {
    const cmds = res.commands ?? []
    if (!cmds.length || !this.runtimeId) return
    for (const cmd of cmds) {
      try {
        if (this.onCommand) await this.onCommand(cmd)
        await this.ackCommand(cmd.id, true)
      } catch {
        await this.ackCommand(cmd.id, false).catch(() => {})
      }
    }
  }

  async ackCommand(commandId: string, ok = true) {
    if (!this.runtimeId) return
    await this.client.request('POST', `/v1/commands/${commandId}/ack`, {
      runtimeId: this.runtimeId,
      ok,
    })
  }

  async disconnect() {
    this.stopHeartbeat()
    if (this.wsDisconnect) {
      this.wsDisconnect()
      this.wsDisconnect = null
    }
    if (this.runtimeId) {
      await this.client
        .request('POST', `/v1/runtimes/${this.runtimeId}/heartbeat`, { status: 'offline' })
        .catch(() => {})
    }
    this.runtimeId = null
    this.organizationId = null
    this.onCommand = null
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
