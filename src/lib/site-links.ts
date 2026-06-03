/**
 * Marketing site destinations (n8n-style split).
 *
 * - **Cloud console** — product CTAs (Start, Enterprise, hosted runtime)
 * - **GitHub / docs** — open-source self-host path
 *
 * Override via Vite env at build time (Cloudflare, Vercel, Render static).
 */

function readPublicViteEnv(key: string): string | undefined {
  if (typeof import.meta === "undefined" || !import.meta.env) return undefined;
  switch (key) {
    case "VITE_GITHUB_URL":
      return import.meta.env.VITE_GITHUB_URL;
    case "VITE_CONSOLE_URL":
      return import.meta.env.VITE_CONSOLE_URL;
    case "VITE_MARKETING_URL":
      return import.meta.env.VITE_MARKETING_URL;
    case "VITE_DOCS_PATH":
      return import.meta.env.VITE_DOCS_PATH;
    case "VITE_EARLY_ACCESS_URL":
      return import.meta.env.VITE_EARLY_ACCESS_URL;
    case "VITE_PRIVACY_URL":
      return import.meta.env.VITE_PRIVACY_URL;
    case "VITE_TERMS_URL":
      return import.meta.env.VITE_TERMS_URL;
    case "VITE_REFUND_URL":
      return import.meta.env.VITE_REFUND_URL;
    case "VITE_ACCEPTABLE_USE_URL":
      return import.meta.env.VITE_ACCEPTABLE_USE_URL;
    case "VITE_PRICING_URL":
      return import.meta.env.VITE_PRICING_URL;
    case "VITE_CONTACT_URL":
      return import.meta.env.VITE_CONTACT_URL;
    case "VITE_BILLING_URL":
      return import.meta.env.VITE_BILLING_URL;
    case "VITE_COOKIES_URL":
      return import.meta.env.VITE_COOKIES_URL;
    case "VITE_PRIVACY_EMAIL":
      return import.meta.env.VITE_PRIVACY_EMAIL;
    case "VITE_BILLING_EMAIL":
      return import.meta.env.VITE_BILLING_EMAIL;
    case "VITE_SUPPORT_EMAIL":
      return import.meta.env.VITE_SUPPORT_EMAIL;
    case "VITE_COMPANY_LEGAL_NAME":
      return import.meta.env.VITE_COMPANY_LEGAL_NAME;
    case "VITE_PRODUCT_LEGAL_NAME":
      return import.meta.env.VITE_PRODUCT_LEGAL_NAME;
    default:
      return undefined;
  }
}

function readEnv(key: string, fallback: string): string {
  const vite = readPublicViteEnv(key);
  if (vite?.trim()) return vite.trim();
  const node = process.env[key]?.trim();
  if (node) return node;
  return fallback;
}

const githubRepo = readEnv("VITE_GITHUB_URL", "https://github.com/Matik103/sanctum-runtime");

/** Hosted operator dashboard — primary product entry */
export const consoleUrl = readEnv("VITE_CONSOLE_URL", "https://console.sanctumruntime.com/");

/** Public marketing site (for cross-links from docs) */
export const marketingUrl = readEnv("VITE_MARKETING_URL", "https://www.sanctumruntime.com/");

/** Primary CTA: cloud console (same as n8n → app.n8n.io) */
export const startUrl = consoleUrl;

/** Public docs on this site */
export const docsPath = readEnv("VITE_DOCS_PATH", "/docs");

/** OSS self-host quick start — clone repo, run locally */
export const quickstartPath = `${docsPath}#quickstart`;

/** Open-core boundaries (public vs enterprise) */
export const openCorePath = `${docsPath}#open-core`;

/**
 * Enterprise / fleet — hosted console (billing, SSO, fleet).
 * Override with VITE_EARLY_ACCESS_URL for a separate waitlist form if needed.
 */
export const enterpriseAccessUrl = readEnv("VITE_EARLY_ACCESS_URL", "/enterprise");

/** Machine-readable index for AI crawlers — absolute so FooterNavLink uses <a>, not TanStack <Link> */
export const llmsTxtUrl = marketingUrl.replace(/\/$/, "") + "/llms.txt";

/** @deprecated Use enterpriseAccessUrl */
export const earlyAccessUrl = enterpriseAccessUrl;

/** Open-source repository */
export const githubUrl = githubRepo;

/** Legal pages (marketing site; use full URL for Google OAuth consent screen) */
export const privacyUrl = readEnv("VITE_PRIVACY_URL", "/privacy");
export const termsUrl = readEnv("VITE_TERMS_URL", "/terms");
export const refundUrl = readEnv("VITE_REFUND_URL", "/refund");
export const acceptableUseUrl = readEnv("VITE_ACCEPTABLE_USE_URL", "/acceptable-use");
export const pricingUrl = readEnv("VITE_PRICING_URL", "/pricing");
export const contactUrl = readEnv("VITE_CONTACT_URL", "/contact");
export const billingUrl = readEnv("VITE_BILLING_URL", "/billing");
export const cookiesUrl = readEnv("VITE_COOKIES_URL", "/cookies");

export const privacyEmail = readEnv("VITE_PRIVACY_EMAIL", "privacy@sanctumruntime.com");
export const billingEmail = readEnv("VITE_BILLING_EMAIL", "billing@sanctumruntime.com");
export const supportEmail = readEnv("VITE_SUPPORT_EMAIL", "support@sanctumruntime.com");

/** Public legal entity for merchant verification and policy pages. */
export const companyLegalName = readEnv("VITE_COMPANY_LEGAL_NAME", "ER Consulting LLC");
export const productLegalName = readEnv("VITE_PRODUCT_LEGAL_NAME", "Sanctum Runtime");
