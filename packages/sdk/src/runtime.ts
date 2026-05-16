import { SanctumClient, type SanctumClientOptions } from './client.js'
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

  constructor(options: SanctumClientOptions = {}) {
    this.client = new SanctumClient(options)
  }

  verifyAction(
    request: ActionRequest,
    options?: { offlineMode?: boolean; correlationId?: string },
  ): Promise<ActionResult> {
    return this.client.verifyAction(request, options)
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
