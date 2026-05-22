import { githubUrl, marketingUrl } from "@/lib/site-links";

export const siteName = "Sanctum Runtime";
export const siteTagline = "Runtime trust infrastructure for autonomous AI";
export const defaultDescription =
  "Sanctum Runtime verifies, governs, and audits autonomous agent and robot actions before they reach APIs, devices, and the physical world.";

const origin = marketingUrl.replace(/\/$/, "");

export const publicRoutes = [
  "/",
  "/blog",
  "/docs",
  "/what-is-sanctum-runtime",
  "/architecture",
  "/sdk",
  "/security",
  "/glossary",
  "/enterprise",
  "/privacy",
  "/terms",
  "/billing",
  "/cookies",
  "/pricing",
  "/contact",
  "/refund",
] as const;

/** HTML routes for sitemap.xml — keep in sync with TanStack routes. */
export const sitemapPages: ReadonlyArray<{
  path: (typeof publicRoutes)[number];
  changefreq: "weekly" | "monthly";
  priority: number;
}> = [
  { path: "/", changefreq: "weekly", priority: 1.0 },
  { path: "/blog", changefreq: "weekly", priority: 0.88 },
  { path: "/docs", changefreq: "weekly", priority: 0.9 },
  { path: "/enterprise", changefreq: "monthly", priority: 0.82 },
  { path: "/what-is-sanctum-runtime", changefreq: "monthly", priority: 0.85 },
  { path: "/architecture", changefreq: "monthly", priority: 0.85 },
  { path: "/sdk", changefreq: "monthly", priority: 0.85 },
  { path: "/security", changefreq: "monthly", priority: 0.8 },
  { path: "/glossary", changefreq: "monthly", priority: 0.8 },
  { path: "/privacy", changefreq: "monthly", priority: 0.5 },
  { path: "/terms", changefreq: "monthly", priority: 0.5 },
  { path: "/billing", changefreq: "monthly", priority: 0.5 },
  { path: "/cookies", changefreq: "monthly", priority: 0.5 },
];

/** Static AI / crawler files under public/ */
export const sitemapAiPaths = [
  "/llms.txt",
  "/ai/overview.md",
  "/ai/architecture.md",
  "/ai/sdk.md",
  "/ai/security.md",
  "/ai/glossary.md",
] as const;

export const sitemapIndexUrl = () => absoluteUrl("/sitemap-index.xml");

/** Google Search Console + Bing Webmaster HTML-tag verification (set in Vercel/Cloudflare env). */
function readViteEnv(key: string): string | undefined {
  if (typeof import.meta === "undefined" || !import.meta.env) {
    return process.env[key]?.trim() || undefined;
  }
  const v = (import.meta.env as Record<string, string | undefined>)[key];
  return v?.trim() || process.env[key]?.trim() || undefined;
}

export function searchVerificationMeta(): Array<{ name: string; content: string }> {
  const meta: Array<{ name: string; content: string }> = [];
  const google = readViteEnv("VITE_GOOGLE_SITE_VERIFICATION");
  const bing = readViteEnv("VITE_BING_SITE_VERIFICATION");
  if (google) meta.push({ name: "google-site-verification", content: google });
  if (bing) meta.push({ name: "msvalidate.01", content: bing });
  return meta;
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalized}`;
}

export function defaultOgImage(): string {
  const custom = readViteEnv("VITE_OG_IMAGE_URL");
  if (custom) return custom.startsWith("http") ? custom : absoluteUrl(custom);
  return absoluteUrl("/og.png");
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

/** Blog post Article schema */
export function articleJsonLd(post: {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    author: { "@type": "Organization", name: siteName, url: origin },
    publisher: {
      "@type": "Organization",
      name: siteName,
      logo: { "@type": "ImageObject", url: defaultOgImage() },
    },
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
    image: defaultOgImage(),
  };
}

/** Homepage FAQ — helps Google AI overviews and rich results */
export const homepageFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is Sanctum Runtime?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sanctum Runtime is an open-core trust layer between AI reasoning and real-world execution. It verifies, approves, or blocks agent and robot actions before side effects run — with policies, audit logs, and human-in-the-loop verification.",
      },
    },
    {
      "@type": "Question",
      name: "How is Sanctum different from LLM guardrails?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Guardrails filter chat input and output. Sanctum gates execution — tool calls, APIs, files, doors, and robot commands — at the action layer with approve, verify, or block decisions.",
      },
    },
    {
      "@type": "Question",
      name: "What systems does Sanctum support?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "One runtime API covers AI agents, humanoids, embodied AI, smart home, ROS2 robotics, workflow automation, industrial systems, healthcare robotics, mobility, and more. Integrate via npm SDK, Python, or 16 framework adapters.",
      },
    },
    {
      "@type": "Question",
      name: "Can Sanctum run offline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The MIT runtime supports offline heuristics and local Ollama risk scoring. Policies and audit can run without cloud dependency for edge and sovereign deployments.",
      },
    },
  ],
};
