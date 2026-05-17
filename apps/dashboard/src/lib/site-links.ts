/** Public marketing docs (linked from console auth footer, etc.) */
export const docsUrl =
  (import.meta.env.VITE_DOCS_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://www.sanctumruntime.com/docs'

export const marketingUrl =
  (import.meta.env.VITE_MARKETING_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://www.sanctumruntime.com'
