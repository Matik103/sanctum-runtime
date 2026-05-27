/** GA4 — set VITE_GA_MEASUREMENT_ID (default G-M4S4DQH0C6). Loaded on production builds only. */
const MEASUREMENT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GA_MEASUREMENT_ID?.trim()) ||
  'G-M4S4DQH0C6'

export function GoogleAnalytics() {
  if (import.meta.env.DEV || !MEASUREMENT_ID) return null

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${MEASUREMENT_ID}');
`.trim(),
        }}
      />
    </>
  )
}
