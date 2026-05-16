import { SanctumClient, type SanctumClientOptions } from './client.js'
import { attachSanctumRuntime, createSanctumMiddleware } from './middleware.js'
import type { ActionPolicy, ActionRequest, ActionResult, PolicyMap } from './types.js'

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

/** PRD-facing runtime entry — embed in agents, backends, robotics hosts (§4.6). */
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
