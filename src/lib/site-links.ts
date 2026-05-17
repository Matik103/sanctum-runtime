/**
 * Marketing site destinations (n8n-style split).
 *
 * - **Cloud console** — product CTAs (Start, Enterprise, hosted runtime)
 * - **GitHub / docs** — open-source self-host path
 *
 * Override via Vite env at build time (Cloudflare, Vercel, Render static).
 */

const githubRepo = import.meta.env.VITE_GITHUB_URL ?? "https://github.com/Matik103/sanctum-runtime";

/** Hosted operator dashboard — primary product entry */
export const consoleUrl =
  import.meta.env.VITE_CONSOLE_URL ?? "https://console.sanctumruntime.com/";

/** Public marketing site (for cross-links from docs) */
export const marketingUrl =
  import.meta.env.VITE_MARKETING_URL ?? "https://www.sanctumruntime.com/";

/** Primary CTA: cloud console (same as n8n → app.n8n.io) */
export const startUrl = consoleUrl;

/** Public docs on this site */
export const docsPath = import.meta.env.VITE_DOCS_PATH ?? "/docs";

/** OSS self-host quick start — clone repo, run locally */
export const quickstartPath = `${docsPath}#quickstart`;

/** Open-core boundaries (public vs enterprise) */
export const openCorePath = `${docsPath}#open-core`;

/**
 * Enterprise / fleet — hosted console (billing, SSO, fleet).
 * Override with VITE_EARLY_ACCESS_URL for a separate waitlist form if needed.
 */
export const enterpriseAccessUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ?? consoleUrl;

/** @deprecated Use enterpriseAccessUrl */
export const earlyAccessUrl = enterpriseAccessUrl;

/** Open-source repository */
export const githubUrl = githubRepo;

/** Optional: privacy policy page or external URL */
export const privacyUrl = import.meta.env.VITE_PRIVACY_URL ?? "/docs#open-core";
