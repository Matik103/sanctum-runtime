import { arch as nodeArch, hostname, platform as nodePlatform } from 'node:os'

export type { HardwareAttestation } from './hardware-attestation.js'

export type AttestationReport = {
  platform?: string
  arch?: string
  hostname?: string
  sdkVersion?: string
  runtimeKind?: string
  hardware?: import('./hardware-attestation.js').HardwareAttestation
}

export function defaultAttestationReport(sdkVersion = '0.1.1'): AttestationReport {
  return {
    platform: nodePlatform(),
    arch: nodeArch(),
    hostname: hostname(),
    sdkVersion,
    runtimeKind: 'node',
  }
}
