import type { ActionResult, Decision } from './types.js'

export type VerificationState = 'pending' | 'approved' | 'blocked' | 'not_found'

export type VerificationStatus = {
  correlationId: string
  status: VerificationState
  entry?: ActionResult
}

export function verificationStateFromDecision(
  decision: Decision | undefined,
): VerificationState {
  if (!decision) return 'not_found'
  if (decision === 'REQUIRE_VERIFICATION') return 'pending'
  if (decision === 'APPROVED') return 'approved'
  return 'blocked'
}
