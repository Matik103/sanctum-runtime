import { arch as nodeArch, hostname, platform as nodePlatform } from 'node:os'

export type AttestationReport = {
  platform?: string
  arch?: string
  hostname?: string
  sdkVersion?: string
  runtimeKind?: string
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
