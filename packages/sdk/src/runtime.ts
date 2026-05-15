import { SanctumClient, type SanctumClientOptions } from './client.js'
import type { ActionRequest, ActionResult } from './types.js'

/** PRD-facing runtime entry — wraps the HTTP API for Phase 1. */
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
}
