/** Canonical brand asset URLs (production). Use for Web Push, webhooks, and docs. */
const CONSOLE_ORIGIN = 'https://console.sanctumruntime.com'

export const brandAssets = {
  logo: `${CONSOLE_ORIGIN}/sanctum-logo.png`,
  favicon: `${CONSOLE_ORIGIN}/favicon.png`,
  icon512: `${CONSOLE_ORIGIN}/favicon-512.png`,
  appleTouchIcon: `${CONSOLE_ORIGIN}/apple-touch-icon.png`,
  /** Default Web Push notification icon */
  pushIcon: `${CONSOLE_ORIGIN}/favicon-512.png`,
} as const
