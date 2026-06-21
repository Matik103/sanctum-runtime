import { Link } from "@tanstack/react-router";
import { trackCta } from "@/lib/analytics";

const links = [
  {
    label: "Docs quickstart",
    to: "/docs#quickstart",
    cta: "proof_docs_quickstart",
    destination: "docs",
    internal: true,
  },
  {
    label: "Security model",
    to: "/security",
    cta: "proof_security_model",
    destination: "security",
    internal: true,
  },
  {
    label: "Runtime vs guardrails",
    to: "/blog/runtime-authorization-vs-guardrails-explained",
    cta: "proof_runtime_vs_guardrails",
    destination: "blog",
    internal: true,
  },
  {
    label: "AI blog index (markdown)",
    to: "/ai/blog-index.md",
    cta: "proof_ai_blog_index",
    destination: "ai_index",
    internal: false,
  },
];

export function ProofLinksStrip() {
  return (
    <section className="relative py-10">
      <div className="container mx-auto px-6">
        <div className="rounded-xl border border-border bg-surface/40 px-4 py-3 md:px-5 md:py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Proof links</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {links.map((item) =>
              item.internal ? (
                <Link
                  key={item.label}
                  to={item.to}
                  className="text-primary hover:underline"
                  onClick={() =>
                    trackCta({
                      location: "proof_links_strip",
                      cta: item.cta,
                      destination: item.destination,
                    })
                  }
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  key={item.label}
                  href={item.to}
                  className="text-primary hover:underline"
                  onClick={() =>
                    trackCta({
                      location: "proof_links_strip",
                      cta: item.cta,
                      destination: item.destination,
                    })
                  }
                >
                  {item.label}
                </a>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
