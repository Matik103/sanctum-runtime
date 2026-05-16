import { SanctumClient, type SanctumClientOptions } from './client.js'
import {
  ControlPlaneSession,
  type ConnectOptions,
  type ConnectResult,
  type RegisterAgentOptions,
} from './control-plane.js'
import { attachSanctumRuntime, createSanctumMiddleware } from './middleware.js'
import type { ActionPolicy, ActionRequest, ActionResult, PolicyMap } from './types.js'
import type { VerificationStatus } from './verification.js'

export type PolicyMode = 'approve' | 'verify' | 'block'

function policyModeToPatch(mode: PolicyMode): Partial<ActionPolicy> {
  switch (mode) {
    case 'approve':
      return { requiresVerification: false, autoBlock: false }
    case 'verify':
      return { requiresVerification: true, autoBlock: false }
    case 'block':
      return { requiresVerification: false, autoBlock: true }
  }
}

/** Runtime entry — embed in agents, backends, robotics hosts. */
export class SanctumRuntime {
  private client: SanctumClient
  readonly control: ControlPlaneSession

  constructor(options: SanctumClientOptions = {}) {
    this.client = new SanctumClient(options)
    this.control = new ControlPlaneSession(this.client)
  }

  /** Register this host with the Sanctum control plane (telemetry + heartbeat). */
  connect(options: ConnectOptions): Promise<ConnectResult> {
    return this.control.connect(options)
  }

  disconnect(): Promise<void> {
    return this.control.disconnect()
  }

  registerAgent(options: RegisterAgentOptions) {
    return this.control.registerAgent(options)
  }

  emitEvent(eventType: string, payload?: Record<string, unknown>, agentId?: string) {
    return this.control.emitEvent(eventType, payload, agentId)
  }

  async verifyAction(
    request: ActionRequest,
    options?: { offlineMode?: boolean; correlationId?: string },
  ): Promise<ActionResult> {
    const enriched: ActionRequest =
      this.control.organizationId != null
        ? {
            ...request,
            context: { ...request.context, org_id: this.control.organizationId },
          }
        : request
    const result = await this.client.verifyAction(enriched, options)
    if (this.control.connected) {
      const type =
        result.decision === 'BLOCKED'
          ? 'policy.blocked'
          : result.decision === 'REQUIRE_VERIFICATION'
            ? 'policy.verification_required'
            : 'policy.approved'
      void this.control.emitEvent(type, {
        action: request.action,
        decision: result.decision,
        correlationId: result.correlationId,
        org_id: this.control.organizationId,
      }, request.actor)
    }
    return result
  }

  getPolicies(): Promise<PolicyMap> {
    return this.client.getPolicies()
  }

  getStatus() {
    return this.client.getStatus()
  }

  getAudit(limit?: number) {
    return this.client.getAudit(limit)
  }

  getVerificationStatus(correlationId: string): Promise<VerificationStatus> {
    return this.client.getVerificationStatus(correlationId)
  }

  waitForVerification(
    correlationId: string,
    options?: { timeoutMs?: number; pollIntervalMs?: number },
  ): Promise<VerificationStatus> {
    return this.client.waitForVerification(correlationId, options)
  }

  resolveAuditEntry(
    id: string,
    body: {
      decision: 'APPROVED' | 'BLOCKED'
      resolvedBy?: string
      note?: string
    },
  ) {
    return this.client.resolveAuditEntry(id, body)
  }

  /** Set policy mode for an action — approve | verify | block. */
  policy(action: string, mode: PolicyMode): Promise<PolicyMap> {
    return this.client.updatePolicy(action, policyModeToPatch(mode))
  }

  /** Register any action name with optional policy fields (unlimited policies). */
  registerPolicy(
    action: string,
    modeOrPatch: PolicyMode | Partial<ActionPolicy> = 'approve',
  ): Promise<PolicyMap> {
    const patch =
      typeof modeOrPatch === 'string' ? policyModeToPatch(modeOrPatch) : modeOrPatch
    return this.client.createPolicy(action, patch)
  }

  deletePolicy(action: string): Promise<PolicyMap> {
    return this.client.deletePolicy(action)
  }

  exportPoliciesYaml(): Promise<string> {
    return this.client.exportPoliciesYaml()
  }

  importPoliciesYaml(yaml: string, merge = true): Promise<PolicyMap> {
    return this.client.importPoliciesYaml(yaml, merge)
  }

  getWebhookStatus() {
    return this.client.getWebhookStatus()
  }

  /** Agent middleware: `agent.use(sanctum.middleware())` pattern. */
  middleware() {
    return createSanctumMiddleware(this)
  }

  /** Robotics attach: `robot.attach(sanctum.runtime())` — Phase 1 registers onAction if present. */
  runtime() {
    return {
      attach: <T extends Parameters<typeof attachSanctumRuntime>[0]>(host: T) =>
        attachSanctumRuntime(host, this),
      middleware: () => this.middleware(),
    }
  }
}
