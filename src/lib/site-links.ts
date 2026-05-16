/**
 * Marketing site destinations.
 * Override via Vite env for production (waitlist URL, custom docs host, etc.).
 */

const githubRepo = import.meta.env.VITE_GITHUB_URL ?? "https://github.com/Matik103/sanctum-runtime";

/** Public docs on this site. Later: https://docs.sanctum.dev */
export const docsPath = import.meta.env.VITE_DOCS_PATH ?? "/docs";

/** OSS quick start — primary CTA for developers. */
export const quickstartPath = `${docsPath}#quickstart`;

/** Open-core boundaries (public vs enterprise). */
export const openCorePath = `${docsPath}#open-core`;

/**
 * Enterprise / design partners — fleet, cloud, advanced intelligence.
 * Not required to run the open-source runtime locally.
 */
export const enterpriseAccessUrl =
  import.meta.env.VITE_EARLY_ACCESS_URL ??
  `${githubRepo}/issues/new?template=early-access.md&labels=early-access`;

/** @deprecated Use enterpriseAccessUrl */
export const earlyAccessUrl = enterpriseAccessUrl;

export const githubUrl = githubRepo;

/** Optional: privacy policy page or external URL */
export const privacyUrl = import.meta.env.VITE_PRIVACY_URL ?? "/docs#open-core";
