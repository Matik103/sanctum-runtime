import type { ActionResult } from './types.js'

export class SanctumActionBlockedError extends Error {
  readonly result: ActionResult
  constructor(result: ActionResult) {
    super(`Action blocked: ${result.action} (${result.reasoning})`)
    this.name = 'SanctumActionBlockedError'
    this.result = result
  }
}

export class SanctumVerificationRequiredError extends Error {
  readonly result: ActionResult
  constructor(result: ActionResult) {
    super(`Verification required: ${result.action} (${result.reasoning})`)
    this.name = 'SanctumVerificationRequiredError'
    this.result = result
  }
}
