/** Baked in at build time (Render: VITE_SANCTUM_API_URL). Dev uses Vite `/api` proxy. */
const envUrl = (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.trim()

export const apiBaseUrl = envUrl
  ? envUrl.replace(/\/$/, '')
  : import.meta.env.DEV
    ? '/api'
    : 'https://api.sanctumruntime.com'
