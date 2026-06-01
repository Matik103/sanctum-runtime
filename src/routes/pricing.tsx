import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { trackCta } from "@/lib/analytics";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl } from "@/lib/site-links";

const path = "/pricing";
const title = "Pricing — Sanctum Runtime";
const description =
  "Sanctum Runtime cloud plan pricing: Developer (free), Operator, Team, and Enterprise. Runtime trust, policy enforcement, and fleet governance.";

type PlanCard = {
  name: string;
  price: string;
  summary: string;
  runtimes: string;
  events: string;
  agents: string;
  highlight?: boolean;
};

const PLANS: PlanCard[] = [
  {
    name: "Developer",
    price: "Free",
    summary: "Self-host or try the cloud console with modest limits.",
    runtimes: "3 runtimes",
    events: "10k verifications / month",
    agents: "5 agents",
  },
  {
    name: "Operator",
    price: "$49 / month",
    summary: "Production teams running multiple runtimes and agents.",
    runtimes: "25 runtimes",
    events: "500k verifications / month",
    agents: "10 agents",
    highlight: true,
  },
  {
    name: "Team",
    price: "$299 / month",
    summary: "Larger fleets, compliance export, and advanced governance.",
    runtimes: "250 runtimes",
    events: "10M verifications / month",
    agents: "50 agents",
  },
  {
    name: "Enterprise",
    price: "Custom",
    summary: "SSO, dedicated support, custom limits, and contractual terms.",
    runtimes: "Unlimited",
    events: "Unlimited",
    agents: "Unlimited",
  },
];

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => pageSeo({ title, description, path }),
});

function PricingPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Plans"
      title="Pricing"
      lead="Sanctum Runtime meters cloud usage by runtimes, agents, and policy verifications. Paid subscriptions are billed through Creem or another authorized payment provider; prices shown before checkout may exclude applicable taxes."
    >
      <p className="text-sm text-muted-foreground">Last updated: May 19, 2026</p>

      <div className="not-prose grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-lg border p-5 ${
              plan.highlight ? "border-primary/50 bg-primary/5" : "border-border bg-card/40"
            }`}
          >
            <h2 className="font-display text-lg font-semibold text-foreground">{plan.name}</h2>
            <p className="mt-1 text-2xl font-semibold text-foreground">{plan.price}</p>
            <p className="mt-2 text-sm text-muted-foreground">{plan.summary}</p>
            <ul className="mt-3 list-none space-y-1 p-0 text-sm text-muted-foreground">
              <li>{plan.runtimes}</li>
              <li>{plan.events}</li>
              <li>{plan.agents}</li>
            </ul>
          </div>
        ))}
      </div>

      <section>
        <h2>Subscribe</h2>
        <p>
          Sign in to the{" "}
          <a
            href={consoleUrl}
            className="text-primary hover:underline"
            onClick={() => trackCta({ location: "pricing", cta: "subscribe_console", destination: "console" })}
          >
            cloud console
          </a>{" "}
          to upgrade, view usage, and manage billing. See also our{" "}
          <Link to="/billing/">Billing policy</Link> and{" "}
          <Link to="/refund/">Refund and Dispute Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Common buying questions</h2>
        <ul>
          <li><strong>Can we start without a sales call?</strong> Yes. Start on Developer, connect an agent, and run one verified action.</li>
          <li><strong>What changes when we upgrade?</strong> Higher runtime/action limits, team workflows, and stronger governance controls.</li>
          <li><strong>Do we need to migrate code between plans?</strong> No. Keep the same runtime integration and scale limits in console.</li>
          <li><strong>Can we self-host first?</strong> Yes. The runtime is open-core (MIT), and teams add cloud console as operations mature.</li>
        </ul>
      </section>

      <section>
        <h2>Who each plan is for</h2>
        <ul>
          <li><strong>Developer</strong> — solo builders, pilots, and proof-of-value projects.</li>
          <li><strong>Operator</strong> — production teams that need consistent approval and audit flow.</li>
          <li><strong>Team</strong> — orgs with multiple runtimes, compliance reporting, and policy ownership.</li>
          <li><strong>Enterprise</strong> — regulated/large orgs needing contractual controls and custom scale.</li>
        </ul>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
