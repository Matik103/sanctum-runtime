/**
 * Marketing site destinations (PRD §6.1, §4.6).
 * Override via Vite env for production (waitlist URL, custom docs host, etc.).
 */

const githubRepo = import.meta.env.VITE_GITHUB_URL ?? "https://github.com/Matik103/sanctum-runtime";

/** Public docs on this site. Later: https://docs.sanctum.dev */
export const docsPath = import.meta.env.VITE_DOCS_PATH ?? "/docs";

/**
 * Waitlist / sales intake — not the runtime itself.
 * Set VITE_EARLY_ACCESS_URL to your Typeform, Tally, or Loops form in production.
 * Default: GitHub issue (works without a form backend).
 */
export const earlyAccessUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ??
  `${githubRepo}/issues/new?template=early-access.md&labels=early-access`;

export const githubUrl = githubRepo;

/** Optional: privacy policy page or external URL */
export const privacyUrl = import.meta.env.VITE_PRIVACY_URL ?? "/docs#open-core";
