import {
  isValidCompanySize,
  isValidCountryCode,
  isValidIndustry,
  normalizeWebsiteUrl,
  TERMS_VERSION,
  type CompanySize,
  type Industry,
} from './signup-fields'

export type AccountKind = 'individual' | 'organization'

export type IndividualSignupFields = {
  fullName: string
  countryCode: string
  acceptedTerms: boolean
}

export type OrganizationSignupFields = {
  legalName: string
  website: string
  countryCode: string
  companySize: CompanySize
  industry: Industry
  primaryContactName: string
  primaryContactTitle: string
  acceptedTerms: boolean
}

export function validateSignupForm(input: {
  accountKind: AccountKind
  email: string
  password: string
  confirmPassword: string
  individual?: IndividualSignupFields
  organization?: OrganizationSignupFields
}): string | null {
  const email = input.email.trim()
  if (!email || !email.includes('@')) {
    return 'Enter a valid work email address.'
  }
  if (input.password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  if (input.password !== input.confirmPassword) {
    return 'Passwords do not match.'
  }

  if (input.accountKind === 'individual') {
    const ind = input.individual
    if (!ind) return 'Complete all required fields.'
    const name = ind.fullName.trim()
    if (name.length < 2) return 'Enter your full legal name.'
    if (!isValidCountryCode(ind.countryCode)) return 'Select your country or region.'
    if (!ind.acceptedTerms) return 'Accept the Terms of Service and Privacy Policy to continue.'
    return null
  }

  const org = input.organization
  if (!org) return 'Complete all required fields.'
  const legalName = org.legalName.trim()
  if (legalName.length < 2) return 'Enter your organization’s legal business name.'
  if (!normalizeWebsiteUrl(org.website)) return 'Enter a valid company website (e.g. acme.com).'
  if (!isValidCountryCode(org.countryCode)) return 'Select your organization’s country or region.'
  if (!isValidCompanySize(org.companySize)) return 'Select your company size.'
  if (!isValidIndustry(org.industry)) return 'Select your industry.'
  const contact = org.primaryContactName.trim()
  if (contact.length < 2) return 'Enter the primary contact’s full name.'
  const title = org.primaryContactTitle.trim()
  if (title.length < 2) return 'Enter the primary contact’s job title.'
  if (!org.acceptedTerms) return 'Accept the Terms of Service and Privacy Policy to continue.'
  return null
}

function termsMetadata(accepted: boolean): Record<string, string> {
  if (!accepted) return {}
  return {
    terms_accepted_at: new Date().toISOString(),
    terms_version: TERMS_VERSION,
  }
}

export function signupMetadata(
  accountKind: AccountKind,
  email: string,
  fields: IndividualSignupFields | OrganizationSignupFields,
): Record<string, string> {
  const base = {
    signup_source: 'dashboard',
    auth_provider: 'email',
    ...termsMetadata(
      accountKind === 'individual'
        ? (fields as IndividualSignupFields).acceptedTerms
        : (fields as OrganizationSignupFields).acceptedTerms,
    ),
  }

  if (accountKind === 'organization') {
    const org = fields as OrganizationSignupFields
    const websiteHost = normalizeWebsiteUrl(org.website)!
    return {
      ...base,
      signup_type: 'organization',
      portal_type: 'operator',
      organization_name: org.legalName.trim(),
      organization_legal_name: org.legalName.trim(),
      organization_website: websiteHost,
      organization_country_code: org.countryCode.toUpperCase(),
      company_size: org.companySize,
      industry: org.industry,
      primary_contact_name: org.primaryContactName.trim(),
      primary_contact_title: org.primaryContactTitle.trim(),
      primary_contact_email: email.trim(),
      display_name: org.primaryContactName.trim(),
    }
  }

  const ind = fields as IndividualSignupFields
  return {
    ...base,
    signup_type: 'individual',
    portal_type: 'operator',
    display_name: ind.fullName.trim(),
    full_name: ind.fullName.trim(),
    country_code: ind.countryCode.toUpperCase(),
  }
}
