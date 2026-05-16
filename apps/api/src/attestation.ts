import { createHmac } from 'node:crypto'
import type { ChallengeStore } from './challenge-store.js'
import type { HardwareAttestationInput, HardwareVerifyResult } from './hardware-attestation.js'
import { verifyHardwareAttestation } from './hardware-attestation.js'
import type { RuntimeMode } from './control-plane-store.js'

export type { HardwareAttestationInput } from './hardware-attestation.js'

export type AttestationReport = {
  platform?: string
  arch?: string
  hostname?: string
  sdkVersion?: string
  runtimeKind?: string
  hardware?: HardwareAttestationInput
}

export type AttestationResult = {
  status: 'verified' | 'unverified' | 'limited'
  trustScore: number
  reasons: string[]
  token: string | null
}

function attestationSecret(): string {
  const explicit = process.env.SANCTUM_ATTESTATION_SECRET?.trim()
  if (explicit && explicit.length >= 16) return explicit
  const service =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (service) return `sanctum-attest-v1:${service.slice(0, 32)}`
  return 'sanctum-dev-attestation-secret'
}

export function issueAttestationToken(
  runtimeId: string,
  fingerprint: string,
  trustScore: number,
): string {
  const payload = `${runtimeId}:${fingerprint}:${trustScore}:${Date.now()}`
  return createHmac('sha256', attestationSecret()).update(payload).digest('base64url')
}

export type EvaluateAttestationOptions = {
  mode: RuntimeMode
  fingerprint: string
  report?: AttestationReport
  challengeStore?: ChallengeStore
  hardwareResult?: HardwareVerifyResult
}

export async function evaluateAttestationAsync(
  input: EvaluateAttestationOptions,
): Promise<AttestationResult & { hardware?: HardwareVerifyResult }> {
  let hardwareResult = input.hardwareResult
  if (input.report?.hardware && input.challengeStore && !hardwareResult) {
    hardwareResult = await verifyHardwareAttestation(input.challengeStore, input.report.hardware)
  }
  const base = evaluateAttestation({ ...input, hardwareResult })
  return { ...base, hardware: hardwareResult }
}

export function evaluateAttestation(input: {
  mode: RuntimeMode
  fingerprint: string
  report?: AttestationReport
  hardwareResult?: HardwareVerifyResult
}): AttestationResult {
  const report = input.report ?? {}
  const reasons: string[] = []
  let score = 100
  const hw = input.hardwareResult

  if (!report.platform) {
    score -= 8
    reasons.push('missing_platform')
  }
  if (!report.hostname) {
    score -= 5
    reasons.push('missing_hostname')
  }
  if (!report.sdkVersion) {
    score -= 3
    reasons.push('missing_sdk_version')
  }
  if (input.fingerprint.length < 16) {
    score -= 15
    reasons.push('weak_fingerprint')
  }

  if (hw?.verified) {
    score += 12
    reasons.push('hardware_attested', ...(hw.reasons ?? []))
  } else if (report.hardware) {
    score -= 20
    reasons.push('hardware_failed', ...(hw?.reasons ?? []))
  }

  switch (input.mode) {
    case 'edge':
      score -= 5
      reasons.push('edge_mode')
      break
    case 'hybrid':
      score -= 8
      reasons.push('hybrid_mode')
      break
    case 'airgap':
      score -= 15
      reasons.push('airgap_mode')
      break
    default:
      break
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  let status: AttestationResult['status'] = 'verified'
  if (score < 60 || (report.hardware && !hw?.verified)) status = 'unverified'
  else if ((input.mode === 'airgap' && !hw?.verified) || score < 85) status = 'limited'

  return {
    status,
    trustScore: score,
    reasons,
    token: null,
  }
}

export async function evaluateAndTokenize(
  runtimeId: string,
  input: {
    mode: RuntimeMode
    fingerprint: string
    report?: AttestationReport
    challengeStore?: ChallengeStore
  },
): Promise<
  AttestationResult & {
    report: AttestationReport & {
      hardwareVerified?: boolean
      hardwareType?: string
    }
  }
> {
  const report = input.report ?? {}
  const evaluated = await evaluateAttestationAsync({
    mode: input.mode,
    fingerprint: input.fingerprint,
    report,
    challengeStore: input.challengeStore,
  })
  const result = evaluated
  const token =
    result.status !== 'unverified'
      ? issueAttestationToken(runtimeId, input.fingerprint, result.trustScore)
      : null
  const enriched = {
    ...report,
    reasons: result.reasons,
    hardwareVerified: evaluated.hardware?.verified ?? false,
    hardwareType: evaluated.hardware?.type,
  }
  return { ...result, token, report: enriched }
}

export { createSoftwareSealedQuote, stubHardwareQuote } from './hardware-attestation.js'
