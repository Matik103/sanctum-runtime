import { createHash, randomBytes } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'

/** Consumer mail domains cannot be used for enterprise SSO auto-join. */
export const BLOCKED_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'mail.com',
  'gmx.com',
  'yandex.com',
  'zoho.com',
])

export function normalizeEmailDomain(input: string): string | null {
  let d = input.trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^@+/, '')
  if (d.startsWith('www.')) d = d.slice(4)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) return null
  if (BLOCKED_EMAIL_DOMAINS.has(d)) return null
  return d
}

export function generateDomainVerificationToken(): string {
  return randomBytes(24).toString('hex')
}

export function dnsTxtRecordValue(token: string): string {
  return `sanctum-domain-verification=${token}`
}

export function dnsTxtHost(domain: string): string {
  return `_sanctum.${domain}`
}

/** Industry-standard DNS TXT proof (root or _sanctum subdomain). */
export async function verifyDomainDnsTxt(domain: string, token: string): Promise<boolean> {
  const needle = dnsTxtRecordValue(token)
  const hosts = [dnsTxtHost(domain), domain]
  for (const host of hosts) {
    try {
      const chunks = await resolveTxt(host)
      const flat = chunks.map((parts) => parts.join(''))
      if (flat.some((txt) => txt.includes(needle))) return true
    } catch {
      // NXDOMAIN / no TXT
    }
  }
  return false
}

export function domainFingerprint(domain: string, orgId: string): string {
  return createHash('sha256').update(`${orgId}:${domain}`).digest('hex').slice(0, 16)
}
