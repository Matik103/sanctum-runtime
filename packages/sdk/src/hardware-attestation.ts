import type { SanctumClient } from './client.js'
import type { AttestationReport } from './attestation.js'

export type HardwareAttestationType = 'tpm2' | 'software-sealed' | 'sgx'

export type HardwareAttestation = {
  type: HardwareAttestationType
  challengeId: string
  nonce: string
  quote: string
  pcrs?: Record<string, string>
  version?: string
}

export type AttestationChallenge = {
  challengeId: string
  nonce: string
  expiresAt: string
  softwareSealedQuote?: string
}

export async function fetchAttestationChallenge(
  client: SanctumClient,
  organizationId?: string,
): Promise<AttestationChallenge> {
  const q = organizationId ? `?org_id=${encodeURIComponent(organizationId)}` : ''
  return client.request<AttestationChallenge>('GET', `/v1/attestation/challenge${q}`)
}

export function buildSoftwareSealedHardware(
  challenge: AttestationChallenge,
): HardwareAttestation {
  if (!challenge.softwareSealedQuote) {
    throw new Error('Challenge response missing softwareSealedQuote')
  }
  return {
    type: 'software-sealed',
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    quote: challenge.softwareSealedQuote,
  }
}

export function buildTpm2Hardware(
  challenge: AttestationChallenge,
  quote: string,
  pcrs: Record<string, string>,
): HardwareAttestation {
  return {
    type: 'tpm2',
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    quote,
    pcrs,
  }
}

export async function defaultAttestationWithHardware(
  client: SanctumClient,
  base: AttestationReport,
  organizationId?: string,
): Promise<AttestationReport> {
  try {
    const challenge = await fetchAttestationChallenge(client, organizationId)
    return {
      ...base,
      hardware: buildSoftwareSealedHardware(challenge),
    }
  } catch {
    return base
  }
}
