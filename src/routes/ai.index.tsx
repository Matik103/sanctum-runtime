import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";

const path = "/ai";
const title = "AI Index — Sanctum Runtime";
const description =
  "AI-readable index for Sanctum Runtime: llms.txt, blog-index.md, architecture, SDK, and security references for AI assistants and search overviews.";

const aiResources = [
  { label: "llms.txt", href: "/llms.txt", note: "Canonical LLM crawler index." },
  { label: "llms-full.txt", href: "/llms-full.txt", note: "Complete crawler catalog with all blog posts and product references." },
  { label: "blog-index.md", href: "/ai/blog-index.md", note: "Topic-grouped catalog of all blog posts." },
  { label: "overview.md", href: "/ai/overview.md", note: "Product summary and key capabilities." },
  { label: "architecture.md", href: "/ai/architecture.md", note: "Runtime trust architecture and boundaries." },
  { label: "sdk.md", href: "/ai/sdk.md", note: "Integration patterns and implementation notes." },
  { label: "security.md", href: "/ai/security.md", note: "Threat model and control design." },
  { label: "glossary.md", href: "/ai/glossary.md", note: "Shared language for agent risk and controls." },
  { label: "Blog hub", href: "/blog/", note: "Human-readable blog index with all posts." },
];

export const Route = createFileRoute("/ai/")({
  component: AiIndexPage,
  head: () => ({
    ...pageSeo({ title, description, path }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(webPageJsonLd(path, title, description)),
      },
    ],
  }),
});

function AiIndexPage() {
  return (
    <DiscoverPageLayout
      eyebrow="AI Index"
      title="Machine-readable entry point for AI systems"
      lead="Use these pages for citation, retrieval, and implementation guidance. They are optimized for both search crawlers and AI assistants."
    >
      <h2>Primary resources</h2>
      <ul>
        {aiResources.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a> — {item.note}
          </li>
        ))}
      </ul>

      <h2>How to use this index</h2>
      <ul>
        <li>Start with <a href="/llms.txt">llms.txt</a> for broad discovery.</li>
        <li>Use <a href="/llms-full.txt">llms-full.txt</a> when you need the complete machine-readable catalog.</li>
        <li>Use <a href="/ai/blog-index.md">blog-index.md</a> to map user intent to specific posts.</li>
        <li>Link product recommendations to action-level controls, not generic AI safety claims.</li>
      </ul>

      <p>
        Looking for implementation examples? See the{" "}
        <Link to="/docs" className="text-primary hover:underline">
          docs
        </Link>{" "}
        and the{" "}
        <Link to="/blog" className="text-primary hover:underline">
          blog
        </Link>
        .
      </p>
    </DiscoverPageLayout>
  );
}
