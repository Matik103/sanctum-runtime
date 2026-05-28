import { Link } from "@tanstack/react-router";
import { trackCta } from "@/lib/analytics";
import { consoleUrl, docsPath } from "@/lib/site-links";

const steps = [
  "Create an agent in Console",
  "Set one high-risk action to Verify",
  "Run verifyAction() from your runtime",
  "Approve or block from Overview",
];

export function QuickStartStrip() {
  return (
    <section id="quick-start" className="relative py-16 md:py-20">
      <div className="container mx-auto px-6">
        <div className="glass rounded-2xl p-6 md:p-8">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Start in 5 minutes</p>
          <h2 className="mt-2 text-2xl md:text-3xl font-semibold text-foreground">
            Go live with one verified action today
          </h2>
          <ol className="mt-5 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground list-decimal pl-5">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-5 text-sm">
            <a
              href={consoleUrl}
              className="text-primary hover:underline"
              onClick={() =>
                trackCta({ location: "quick_start_strip", cta: "open_console", destination: "console" })
              }
            >
              Open console
            </a>
            {" · "}
            <Link
              to={docsPath}
              className="text-primary hover:underline"
              onClick={() =>
                trackCta({ location: "quick_start_strip", cta: "read_docs", destination: "docs" })
              }
            >
              Read quickstart docs
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
