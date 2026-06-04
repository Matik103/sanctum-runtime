import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signupMetadata, validateSignupForm } from './signup'
import { normalizeWebsiteUrl } from './signup-fields'
import { oauthSignupMetadata } from './oauth'

const validIndividual = {
  fullName: 'Jane Doe',
  countryCode: 'US',
  acceptedTerms: true,
}

const validOrganization = {
  legalName: 'Acme Robotics Inc.',
  website: 'https://acme.com',
  countryCode: 'US',
  companySize: '11-50' as const,
  industry: 'robotics' as const,
  primaryContactName: 'Jane Doe',
  primaryContactTitle: 'Head of Platform',
  acceptedTerms: true,
}

const base = {
  email: 'jane@acme.com',
  password: 'securepass1',
  confirmPassword: 'securepass1',
}

describe('validateSignupForm', () => {
  it('accepts valid individual signup', () => {
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        individual: validIndividual,
      }),
    ).toBeNull()
  })

  it('accepts valid organization signup', () => {
    expect(
      validateSignupForm({
        accountKind: 'organization',
        ...base,
        organization: validOrganization,
      }),
    ).toBeNull()
  })

  it('rejects invalid email', () => {
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        email: 'not-an-email',
        individual: validIndividual,
      }),
    ).toContain('email')
  })

  it('rejects password mismatch and short password', () => {
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        confirmPassword: 'different1',
        individual: validIndividual,
      }),
    ).toContain('match')
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        password: 'short',
        confirmPassword: 'short',
        individual: validIndividual,
      }),
    ).toContain('8 characters')
  })

  it('requires individual profile fields and terms', () => {
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        individual: { ...validIndividual, fullName: 'J', acceptedTerms: false },
      }),
    ).toContain('legal name')
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        individual: { ...validIndividual, countryCode: '' },
      }),
    ).toContain('country')
    expect(
      validateSignupForm({
        accountKind: 'individual',
        ...base,
        individual: { ...validIndividual, acceptedTerms: false },
      }),
    ).toContain('Terms')
  })

  it('requires organization compliance fields', () => {
    expect(
      validateSignupForm({
        accountKind: 'organization',
        ...base,
        organization: { ...validOrganization, legalName: 'A' },
      }),
    ).toContain('legal business name')
    expect(
      validateSignupForm({
        accountKind: 'organization',
        ...base,
        organization: { ...validOrganization, website: 'not a url' },
      }),
    ).toContain('website')
    expect(
      validateSignupForm({
        accountKind: 'organization',
        ...base,
        organization: { ...validOrganization, primaryContactTitle: 'X' },
      }),
    ).toContain('job title')
  })
})

describe('signupMetadata', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('maps individual fields for Supabase auth metadata', () => {
    const meta = signupMetadata('individual', base.email, validIndividual)
    expect(meta).toMatchObject({
      signup_type: 'individual',
      portal_type: 'operator',
      signup_source: 'dashboard',
      display_name: 'Jane Doe',
      full_name: 'Jane Doe',
      country_code: 'US',
      terms_version: '2025-05',
      terms_accepted_at: '2026-05-30T12:00:00.000Z',
    })
  })

  it('maps organization fields including normalized website', () => {
    const meta = signupMetadata('organization', base.email, validOrganization)
    expect(meta).toMatchObject({
      signup_type: 'organization',
      portal_type: 'operator',
      organization_name: 'Acme Robotics Inc.',
      organization_legal_name: 'Acme Robotics Inc.',
      organization_website: 'acme.com',
      organization_country_code: 'US',
      company_size: '11-50',
      industry: 'robotics',
      primary_contact_name: 'Jane Doe',
      primary_contact_title: 'Head of Platform',
      primary_contact_email: 'jane@acme.com',
    })
    expect(normalizeWebsiteUrl('acme.com')).toBe('acme.com')
  })
})

describe('oauthSignupMetadata', () => {
  it('stamps operator portal for personal OAuth', () => {
    expect(oauthSignupMetadata('operator', 'google')).toMatchObject({
      signup_type: 'individual',
      portal_type: 'operator',
      auth_provider: 'google',
      signup_source: 'dashboard',
    })
  })

  it('stamps enterprise portal and terms for company SSO', () => {
    const at = '2026-05-30T12:00:00.000Z'
    expect(oauthSignupMetadata('enterprise', 'github', at)).toMatchObject({
      portal_type: 'enterprise',
      auth_provider: 'github',
      terms_accepted_at: at,
      terms_version: '2025-05',
    })
  })
})
