import { Link } from "@tanstack/react-router";
import { trackCta } from "@/lib/analytics";
import { consoleUrl } from "@/lib/site-links";

const paths = [
  {
    title: "Founder / Product Lead",
    desc: "Ship quickly without betting trust on prompts alone.",
    cta: "Launch first gated workflow",
    href: consoleUrl,
    destination: "console",
    event: "founder_path",
  },
  {
    title: "Security / Compliance",
    desc: "Get approval evidence, policy history, and incident-ready controls.",
    cta: "Review pricing and plans",
    href: "/pricing/",
    destination: "pricing",
    event: "security_path",
    internal: true,
  },
  {
    title: "Platform Engineer",
    desc: "Integrate verifyAction() once and tune policies without redeploying.",
    cta: "Go to docs quickstart",
    href: "/docs#quickstart",
    destination: "docs",
    event: "platform_path",
    internal: true,
  },
];

export function PersonaPaths() {
  return (
    <section id="persona-paths" className="relative py-20 md:py-24 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Choose your path</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">Start where your team is today</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {paths.map((path) => (
            <article key={path.title} className="glass rounded-xl p-6 border border-border">
              <h3 className="text-lg font-semibold text-foreground">{path.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{path.desc}</p>
              <p className="mt-4 text-sm">
                {path.internal ? (
                  <Link
                    to={path.href}
                    className="text-primary hover:underline font-medium"
                    onClick={() =>
                      trackCta({
                        location: "persona_paths",
                        cta: path.event,
                        destination: path.destination,
                      })
                    }
                  >
                    {path.cta}
                  </Link>
                ) : (
                  <a
                    href={path.href}
                    className="text-primary hover:underline font-medium"
                    onClick={() =>
                      trackCta({
                        location: "persona_paths",
                        cta: path.event,
                        destination: path.destination,
                      })
                    }
                  >
                    {path.cta}
                  </a>
                )}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
