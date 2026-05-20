export type AccountKind = 'individual' | 'organization'

export function validateSignupForm(input: {
  accountKind: AccountKind
  email: string
  password: string
  confirmPassword: string
  organizationName?: string
  primaryContactName?: string
}): string | null {
  const email = input.email.trim()
  if (!email || !email.includes('@')) {
    return 'Enter a valid email address.'
  }
  if (input.password.length < 8) {
    return 'Password must be at least 8 characters.'
  }
  if (input.password !== input.confirmPassword) {
    return 'Passwords do not match.'
  }
  if (input.accountKind === 'organization') {
    const org = (input.organizationName ?? '').trim()
    if (org.length < 2) {
      return 'Organization name must be at least 2 characters.'
    }
    const contact = (input.primaryContactName ?? '').trim()
    if (contact.length < 2) {
      return 'Primary contact name must be at least 2 characters.'
    }
  }
  return null
}

export function signupMetadata(
  accountKind: AccountKind,
  fields: { organizationName?: string; primaryContactName?: string },
): Record<string, string> {
  if (accountKind === 'organization') {
    return {
      signup_type: 'organization',
      portal_type: 'enterprise',
      auth_provider: 'email',
      organization_name: fields.organizationName!.trim(),
      primary_contact_name: fields.primaryContactName!.trim(),
      display_name: fields.primaryContactName!.trim(),
    }
  }
  return {
    signup_type: 'individual',
    portal_type: 'operator',
    auth_provider: 'email',
  }
}
