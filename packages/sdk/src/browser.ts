/**
 * Browser-safe SDK surface (dashboard, static hosts).
 * Excludes Node-only modules: agent memory (scrypt), full runtime control plane.
 */
export * from './types.js'
export { ActionRequestSchema } from './types.js'
export { SanctumClient } from './client.js'
export {
  SanctumActionBlockedError,
  SanctumVerificationRequiredError,
} from './errors.js'
export { evaluationModeLabel, formatActionResult, formatDemoResult } from './labels.js'
export {
  auditRecordHeadline,
  auditRecordText,
  buildHumanAuditRecord,
  extractHeardPhrase,
  extractIntent,
  NARRATIVE_CONTEXT_KEYS,
} from './narrative.js'
export { humanizeContextValue, humanizeToken } from './humanize.js'
export {
  verificationStateFromDecision,
  type VerificationState,
  type VerificationStatus,
} from './verification.js'
export {
  computeBehavioralTrustScore,
  formatAttestationTrustScore,
  trustScoreTone,
  type TrustScoreInput,
} from './trust-scores.js'
