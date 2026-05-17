import { githubUrl, marketingUrl } from "@/lib/site-links";

export const siteName = "Sanctum Runtime";
export const siteTagline = "Runtime trust infrastructure for autonomous AI";
export const defaultDescription =
  "Sanctum Runtime verifies, governs, and audits autonomous agent and robot actions before they reach APIs, devices, and the physical world.";

const origin = marketingUrl.replace(/\/$/, "");

export const publicRoutes = [
  "/",
  "/docs",
  "/what-is-sanctum-runtime",
  "/architecture",
  "/sdk",
  "/security",
  "/glossary",
] as const;

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export function defaultOgImage(): string {
  return absoluteUrl("/favicon-512.png");
}

export type PageSeoOptions = {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  ogType?: "website" | "article";
};

/** Per-route head() for TanStack Start — canonical, Open Graph, Twitter. */
export function pageSeo({ title, description, path, ogImage, ogType = "website" }: PageSeoOptions) {
  const url = absoluteUrl(path);
  const image = ogImage ?? defaultOgImage();

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "author", content: "Sanctum" },
      { property: "og:site_name", content: siteName },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: ogType },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: origin,
  logo: absoluteUrl("/favicon-512.png"),
  description: defaultDescription,
  sameAs: [githubUrl],
};

export const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Cloud, Linux, edge",
  description: defaultDescription,
  url: origin,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Open-core MIT runtime with hosted control plane",
  },
};

export function webPageJsonLd(path: string, name: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url: absoluteUrl(path),
    isPartOf: { "@type": "WebSite", name: siteName, url: origin },
  };
}
