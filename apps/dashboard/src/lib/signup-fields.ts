/** Standard signup field options (B2B SaaS / SOC 2 vendor intake). */

export const TERMS_VERSION = '2025-05'

export const COMPANY_SIZE_OPTIONS = [
  { value: '1-10', label: '1–10 employees' },
  { value: '11-50', label: '11–50 employees' },
  { value: '51-200', label: '51–200 employees' },
  { value: '201-1000', label: '201–1,000 employees' },
  { value: '1001+', label: '1,001+ employees' },
] as const

export type CompanySize = (typeof COMPANY_SIZE_OPTIONS)[number]['value']

export const INDUSTRY_OPTIONS = [
  { value: 'software', label: 'Software & technology' },
  { value: 'robotics', label: 'Robotics & autonomy' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'healthcare', label: 'Healthcare & life sciences' },
  { value: 'financial', label: 'Financial services' },
  { value: 'defense', label: 'Defense & aerospace' },
  { value: 'logistics', label: 'Logistics & supply chain' },
  { value: 'energy', label: 'Energy & utilities' },
  { value: 'professional', label: 'Professional services' },
  { value: 'other', label: 'Other' },
] as const

export type Industry = (typeof INDUSTRY_OPTIONS)[number]['value']

/** ISO 3166-1 alpha-2 — common markets first, then alphabetical. */
export const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'IE', label: 'Ireland' },
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'SG', label: 'Singapore' },
  { value: 'JP', label: 'Japan' },
  { value: 'KR', label: 'South Korea' },
  { value: 'IN', label: 'India' },
  { value: 'IL', label: 'Israel' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
  { value: 'FI', label: 'Finland' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
  { value: 'BR', label: 'Brazil' },
  { value: 'MX', label: 'Mexico' },
]

const COMPANY_SIZE_SET = new Set(COMPANY_SIZE_OPTIONS.map((o) => o.value))
const INDUSTRY_SET = new Set(INDUSTRY_OPTIONS.map((o) => o.value))
const COUNTRY_SET = new Set(COUNTRY_OPTIONS.map((o) => o.value))

export function isValidCountryCode(code: string): boolean {
  return COUNTRY_SET.has(code.trim().toUpperCase())
}

export function isValidCompanySize(size: string): boolean {
  return COMPANY_SIZE_SET.has(size as CompanySize)
}

export function isValidIndustry(industry: string): boolean {
  return INDUSTRY_SET.has(industry as Industry)
}

/** Normalize user-entered website to a hostname for storage. */
export function normalizeWebsiteUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    const url = new URL(withScheme)
    if (!url.hostname || !url.hostname.includes('.')) return null
    return url.hostname.toLowerCase()
  } catch {
    return null
  }
}
