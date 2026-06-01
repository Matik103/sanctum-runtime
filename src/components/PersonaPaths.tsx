import { Link } from "@tanstack/react-router";
import { trackCta } from "@/lib/analytics";

const paths = [
  {
    title: "Agent Startup",
    desc: "Launch with visible action controls before customers trust your agent with data, money, or production.",
    cta: "Run the first-user pilot",
    href: "/first-100-users/",
    destination: "first_100_users",
    event: "startup_path",
    internal: true,
  },
  {
    title: "Platform / AI Engineer",
    desc: "Use Connect Agent for no-SDK proxy gating, or keep the SDK and adapters for deeper runtime ownership.",
    cta: "Open quickstart docs",
    href: "/docs#quickstart",
    destination: "docs",
    event: "platform_path",
    internal: true,
  },
  {
    title: "Security / Compliance",
    desc: "Turn agent activity into approval evidence, source-trust history, policy replay, and incident response.",
    cta: "Review plans",
    href: "/pricing/",
    destination: "pricing",
    event: "security_path",
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
