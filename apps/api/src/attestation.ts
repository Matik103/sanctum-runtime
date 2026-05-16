import { createHmac, randomBytes } from 'node:crypto'
import type { RuntimeMode } from './control-plane-store.js'

export type AttestationReport = {
  platform?: string
  arch?: string
  hostname?: string
  sdkVersion?: string
  runtimeKind?: string
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

export function evaluateAttestation(input: {
  mode: RuntimeMode
  fingerprint: string
  report?: AttestationReport
}): AttestationResult {
  const report = input.report ?? {}
  const reasons: string[] = []
  let score = 100

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
  if (score < 60) status = 'unverified'
  else if (input.mode === 'airgap' || score < 85) status = 'limited'

  return {
    status,
    trustScore: score,
    reasons,
    token: null,
  }
}

export function evaluateAndTokenize(
  runtimeId: string,
  input: {
    mode: RuntimeMode
    fingerprint: string
    report?: AttestationReport
  },
): AttestationResult & { report: AttestationReport } {
  const report = input.report ?? {}
  const result = evaluateAttestation({ ...input, report })
  const token =
    result.status !== 'unverified'
      ? issueAttestationToken(runtimeId, input.fingerprint, result.trustScore)
      : null
  return { ...result, token, report }
}

/** Placeholder for Phase 3+ hardware quotes (TPM, SGX, etc.). */
export function stubHardwareQuote(): { quote: string; nonce: string } {
  return {
    quote: createHmac('sha256', attestationSecret())
      .update(randomBytes(16))
      .digest('hex'),
    nonce: randomBytes(12).toString('base64url'),
  }
}
