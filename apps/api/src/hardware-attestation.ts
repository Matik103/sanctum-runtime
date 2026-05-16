import { createHmac } from 'node:crypto'
import type { ChallengeStore } from './challenge-store.js'

export type HardwareAttestationType = 'tpm2' | 'software-sealed' | 'sgx'

export type HardwareAttestationInput = {
  type: HardwareAttestationType
  challengeId: string
  nonce: string
  quote: string
  pcrs?: Record<string, string>
  version?: string
}

export type HardwareVerifyResult = {
  verified: boolean
  type?: HardwareAttestationType
  reasons: string[]
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

function expectedQuote(
  type: HardwareAttestationType,
  challengeId: string,
  nonce: string,
  pcrs?: Record<string, string>,
): string {
  let material = `${challengeId}:${nonce}`
  if (type === 'tpm2' || type === 'sgx') {
    const canonical = Object.keys(pcrs ?? {})
      .sort()
      .map((k) => `${k}=${pcrs![k]}`)
      .join(';')
    material += `:${canonical}`
  }
  return createHmac('sha256', attestationSecret()).update(material).digest('base64url')
}

export async function verifyHardwareAttestation(
  store: ChallengeStore,
  hardware: HardwareAttestationInput,
): Promise<HardwareVerifyResult> {
  const reasons: string[] = []

  if (!hardware.challengeId || !hardware.nonce || !hardware.quote) {
    return { verified: false, reasons: ['hardware_incomplete'] }
  }

  const challenge = await store.consume(hardware.challengeId, hardware.nonce)
  if (!challenge) {
    return { verified: false, reasons: ['challenge_invalid_or_expired'] }
  }

  if (hardware.type === 'tpm2' || hardware.type === 'sgx') {
    const pcrCount = Object.keys(hardware.pcrs ?? {}).length
    if (pcrCount < 1) {
      return { verified: false, type: hardware.type, reasons: ['pcrs_required'] }
    }
  }

  const expected = expectedQuote(hardware.type, hardware.challengeId, hardware.nonce, hardware.pcrs)
  const quoteOk =
    hardware.quote === expected ||
    hardware.quote === expected.replace(/=/g, '') // tolerate base64 padding trim

  if (!quoteOk) {
    return { verified: false, type: hardware.type, reasons: ['quote_mismatch'] }
  }

  reasons.push('hardware_verified')
  return { verified: true, type: hardware.type, reasons }
}

export function createSoftwareSealedQuote(
  challengeId: string,
  nonce: string,
): { quote: string; type: 'software-sealed' } {
  return {
    type: 'software-sealed',
    quote: expectedQuote('software-sealed', challengeId, nonce),
  }
}

/** @deprecated Use challenge API + verifyHardwareAttestation */
export function stubHardwareQuote(): { quote: string; nonce: string } {
  const nonce = createHmac('sha256', attestationSecret())
    .update(Date.now().toString())
    .digest('base64url')
  return {
    nonce,
    quote: createHmac('sha256', attestationSecret()).update(nonce).digest('hex'),
  }
}
