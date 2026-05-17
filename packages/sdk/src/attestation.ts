import { arch as nodeArch, cpus, hostname, platform as nodePlatform, totalmem } from 'node:os'
import { existsSync } from 'node:fs'

export type { HardwareAttestation } from './hardware-attestation.js'

export type AttestationReport = {
  platform?: string
  arch?: string
  hostname?: string
  sdkVersion?: string
  runtimeKind?: string
  nodeVersion?: string
  cpuCount?: number
  totalMemoryMb?: number
  containerEnv?: string
  cloudProvider?: string
  hardware?: import('./hardware-attestation.js').HardwareAttestation
}

function detectContainerEnv(): string {
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes'
  try {
    if (existsSync('/.dockerenv')) return 'docker'
  } catch { /* ignore */ }
  if (process.env.container === 'docker') return 'docker'
  return 'none'
}

function detectCloudProvider(): string {
  if (process.env.AWS_EXECUTION_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_REGION) return 'aws'
  if (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.K_SERVICE) return 'gcp'
  if (process.env.AZURE_SUBSCRIPTION_ID || process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.WEBSITE_SITE_NAME) return 'azure'
  return 'none'
}

export function defaultAttestationReport(sdkVersion = '0.1.1'): AttestationReport {
  return {
    platform: nodePlatform(),
    arch: nodeArch(),
    hostname: hostname(),
    sdkVersion,
    runtimeKind: 'node',
    nodeVersion: process.version,
    cpuCount: cpus().length,
    totalMemoryMb: Math.round(totalmem() / (1024 * 1024)),
    containerEnv: detectContainerEnv(),
    cloudProvider: detectCloudProvider(),
  }
}
