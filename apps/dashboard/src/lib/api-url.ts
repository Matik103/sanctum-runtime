/** Baked in at build time (Render: VITE_SANCTUM_API_URL). */
export const apiBaseUrl =
  (import.meta.env.VITE_SANCTUM_API_URL as string | undefined)?.replace(/\/$/, '') ??
  'https://api.sanctumruntime.com'
