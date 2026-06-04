import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CreditCard,
  Eye,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CtaFooter } from "@/components/CtaFooter";
import { trackCta } from "@/lib/analytics";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl } from "@/lib/site-links";

const path = "/pricing";
const title = "Pricing - Sanctum Runtime";
const description =
  "Sanctum Runtime pricing for agent observability, governed actions, production approvals, Shield enforcement, SSO, and compliance exports.";

type Plan = {
  name: string;
  headline: string;
  price: string;
  note?: string;
  promise: string;
  cta: string;
  ctaVariant?: "primary" | "secondary";
  highlighted?: boolean;
  stats: Array<{ label: string; value: string }>;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Observer",
    headline: "See every payment and email",
    price: "$0",
    note: "Free forever",
    promise: "Connect your agents in minutes. Watch side effects in Live Feed before you pay.",
    cta: "Start watching",
    ctaVariant: "secondary",
    stats: [
      { label: "Agents", value: "2" },
      { label: "Observe events", value: "Unlimited" },
      { label: "Governed actions", value: "50/mo" },
      { label: "Retention", value: "7 days" },
    ],
    features: [
      "Connect proxy in observe mode",
      "Live Feed and audit read",
      "3 SDK runtimes",
      "Fair-use observe protection",
    ],
  },
  {
    name: "Personal",
    headline: "Remember and nudge",
    price: "$12",
    note: "$99/year for indie builders",
    promise: "History, alerts, and light gates for solo builders who want control without ceremony.",
    cta: "Choose Personal",
    stats: [
      { label: "Agents", value: "5" },
      { label: "Observe events", value: "Unlimited" },
      { label: "Governed actions", value: "500/mo" },
      { label: "Retention", value: "30 days" },
    ],
    features: [
      "Connect observe to gate",
      "Basic policies and alerts",
      "Balanced and Observe presets",
      "Weekly digest when enabled",
    ],
  },
  {
    name: "Operator",
    headline: "Stop them before they run",
    price: "$59",
    note: "Recommended for production",
    promise: "Approve, block, and Shield production side effects before the executor moves.",
    cta: "Run production gates",
    ctaVariant: "primary",
    highlighted: true,
    stats: [
      { label: "Agents", value: "10" },
      { label: "Runtimes", value: "25" },
      { label: "Governed actions", value: "500k/mo" },
      { label: "Retention", value: "30 days" },
    ],
    features: [
      "Full Shield enforcement",
      "Holds, mobile approve, and deny",
      "Webhooks and hosted Connect proxy",
      "Encrypted platform keys",
    ],
  },
  {
    name: "Team",
    headline: "Govern the fleet",
    price: "$299",
    note: "Unlimited operators",
    promise: "Fleet policy, audit exports, and ownership controls for teams shipping agents.",
    cta: "Upgrade the org",
    stats: [
      { label: "Governed actions", value: "10M/mo" },
      { label: "Operators", value: "Unlimited" },
      { label: "SSO / RBAC", value: "Included" },
      { label: "Exports", value: "Included" },
    ],
    features: [
      "SSO and RBAC",
      "Compliance evidence export",
      "Org-wide policy ownership",
      "Priority support path",
    ],
  },
];

const meters = [
  {
    icon: Eye,
    label: "Observe",
    copy: "Connect proxy log-only, Live Feed, and audit reads. Generous by design so teams can see value first.",
    pays: "Free / generous",
  },
  {
    icon: ShieldCheck,
    label: "Governed",
    copy: "Verify, proxy gate, holds, approve/block, Shield enforcement, and action-token control.",
    pays: "Personal+",
  },
  {
    icon: LockKeyhole,
    label: "Premium",
    copy: "SSO, compliance export, fleet policy, private deployment, SLA, and custom retention.",
    pays: "Team / Enterprise",
  },
];

const upgradeTriggers = [
  "51st governed action: upgrade to keep blocking.",
  "Day 8 on Observer: upgrade for 30-day history.",
  "Toggle Connect to gate: production control starts at Operator.",
  "Shadow mode: see which transfer would have been held.",
];

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => pageSeo({ title, description, path }),
});

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-[calc(7rem+env(safe-area-inset-top,0px))]">
        <section className="container mx-auto px-6 pb-12">
          <div className="mx-auto max-w-5xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Bill curiosity lightly. Bill control clearly.
            </div>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Look free. Stop cheap. Run production with proof.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-muted-foreground">
              We do not charge you just to watch your agents. You pay when Sanctum is asked to stop,
              approve, or prove real-world actions like payments, emails, deployments, and tool calls.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={consoleUrl}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-primary/30"
                onClick={() => trackCta({ location: "pricing_hero", cta: "start_console", destination: "console" })}
              >
                Start free
              </a>
              <Link
                to="/pilot"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-border bg-card/50 px-6 py-3 font-semibold text-foreground transition hover:border-primary/40 hover:bg-card"
              >
                Run a pilot
              </Link>
            </div>
          </div>

          <div className="mt-10 grid gap-3 rounded-2xl border border-border bg-card/40 p-3 sm:grid-cols-3">
            {meters.map((meter) => {
              const Icon = meter.icon;
              return (
                <article key={meter.label} className="rounded-xl border border-border/70 bg-background/70 p-5 text-left">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">{meter.label}</h2>
                      <p className="text-xs font-medium uppercase tracking-wider text-primary">{meter.pays}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{meter.copy}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border bg-card/20 py-12">
          <div className="container mx-auto px-6">
            <div className="grid gap-4 lg:grid-cols-4">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex min-h-full flex-col rounded-2xl border p-5 shadow-sm ${
                    plan.highlighted
                      ? "border-primary/60 bg-primary/10 shadow-primary/10"
                      : "border-border bg-background/80"
                  }`}
                >
                  {plan.highlighted ? (
                    <div className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      Recommended
                    </div>
                  ) : null}
                  <p className="text-sm font-medium uppercase tracking-wider text-primary">{plan.name}</p>
                  <h2 className="mt-3 pr-20 text-2xl font-semibold tracking-tight text-foreground">{plan.headline}</h2>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="text-4xl font-semibold text-foreground">{plan.price}</span>
                    {plan.price.startsWith("$") ? <span className="pb-1 text-muted-foreground">/mo</span> : null}
                  </div>
                  {plan.note ? <p className="mt-2 text-sm text-muted-foreground">{plan.note}</p> : null}
                  <p className="mt-4 min-h-16 text-sm leading-relaxed text-muted-foreground">{plan.promise}</p>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {plan.stats.map((stat) => (
                      <div key={stat.label} className="rounded-lg border border-border bg-card/50 p-3">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <ul className="mt-5 flex-1 space-y-2 p-0 text-sm text-muted-foreground">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={consoleUrl}
                    className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      plan.ctaVariant === "primary"
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:-translate-y-0.5"
                        : "border border-border bg-card/60 text-foreground hover:border-primary/40 hover:bg-card"
                    }`}
                    onClick={() => trackCta({ location: "pricing_card", cta: plan.name.toLowerCase(), destination: "console" })}
                  >
                    {plan.cta}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto grid gap-6 px-6 py-14 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">Upgrade moments</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              The paywall appears when power appears.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Observer is built for discovery. Personal and Operator unlock the moment Sanctum moves from
              "what happened?" to "should this execute?"
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {upgradeTriggers.map((trigger, index) => (
              <div key={trigger} className="rounded-xl border border-border bg-card/40 p-5">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {index + 1}
                </div>
                <p className="mt-4 text-sm font-medium leading-relaxed text-foreground">{trigger}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="container mx-auto px-6 pb-16">
          <div className="grid gap-4 rounded-2xl border border-border bg-card/40 p-5 md:grid-cols-3">
            <div className="md:col-span-1">
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Open core</p>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Self-host the runtime. Pay for hosted control.</h2>
            </div>
            <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/70 p-5">
                <RadioTower className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">Free forever</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  SDK, basic policies, self-hosted verify, and local audit.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-5">
                <Bell className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold text-foreground">Paid cloud</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Hosted Connect, encrypted keys, cloud sync, push approve, Shield fleet, and exports.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto grid gap-4 px-6 pb-20 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background/80 p-5">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">Billing</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Paid subscriptions are processed by Creem or another authorized payment provider. Taxes may apply at checkout.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 p-5">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">No seat tax</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Team plans meter governed actions, runtimes, and agents. Operators can review without per-seat friction.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background/80 p-5">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">Fair use</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Observe is generous. We throttle abuse quietly so normal teams can keep watching without surprise charges.
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 pb-20">
          <div className="rounded-2xl border border-border bg-primary/10 p-6 text-center">
            <h2 className="text-2xl font-semibold text-foreground">Not ready to buy? Perfect.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Start on Observer, connect one real action, and watch the boundary appear in Live Feed.
              Upgrade only when you want Sanctum to stop or approve execution.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={consoleUrl}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground"
                onClick={() => trackCta({ location: "pricing_footer", cta: "start_observer", destination: "console" })}
              >
                Start Observer
              </a>
              <Link
                to="/billing"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card/60 px-5 py-2 font-semibold text-foreground"
              >
                Billing policy
              </Link>
            </div>
          </div>
        </section>

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
        />
      </main>
      <CtaFooter />
    </div>
  );
}
