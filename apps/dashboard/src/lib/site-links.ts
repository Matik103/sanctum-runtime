/** Public marketing site + legal pages (console footers, auth screen). */

const marketingBase =
  (import.meta.env.VITE_MARKETING_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://www.sanctumruntime.com'

export const marketingUrl = marketingBase

export const docsUrl =
  (import.meta.env.VITE_DOCS_URL as string | undefined)?.replace(/\/$/, '') ??
  `${marketingBase}/docs`

export const privacyUrl =
  (import.meta.env.VITE_PRIVACY_URL as string | undefined) ?? `${marketingBase}/privacy`

export const termsUrl =
  (import.meta.env.VITE_TERMS_URL as string | undefined) ?? `${marketingBase}/terms`

export const refundUrl =
  (import.meta.env.VITE_REFUND_URL as string | undefined) ?? `${marketingBase}/refund`

export const acceptableUseUrl =
  (import.meta.env.VITE_ACCEPTABLE_USE_URL as string | undefined) ?? `${marketingBase}/acceptable-use`

export const pricingUrl =
  (import.meta.env.VITE_PRICING_URL as string | undefined) ?? `${marketingBase}/pricing`

export const contactUrl =
  (import.meta.env.VITE_CONTACT_URL as string | undefined) ?? `${marketingBase}/contact`

export const billingEmail =
  (import.meta.env.VITE_BILLING_EMAIL as string | undefined) ?? 'billing@sanctumruntime.com'
