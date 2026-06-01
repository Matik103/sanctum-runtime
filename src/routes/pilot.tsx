import { createFileRoute } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { trackCta } from "@/lib/analytics";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl } from "@/lib/site-links";

const path = "/pilot";
const title = "AI Agent Safety Pilot — Sanctum Runtime";
const description =
  "Run a production-style Sanctum pilot by protecting one real AI agent action with runtime verification, human approval, signed action tokens, and audit evidence.";

const pilotTeams = [
  "AI SaaS teams whose agents send messages, update CRMs, deploy code, or change customer data",
  "Platform teams adding MCP, LangChain, CrewAI, Vercel AI SDK, or OpenAI tool calling to production",
  "Security and compliance teams that need approval evidence before expanding agent permissions",
  "Robotics, smart-home, and industrial teams moving from demos to physical-world autonomy",
];

const pilotActions = [
  "send_customer_email",
  "transfer_funds",
  "delete_database_record",
  "deploy_production",
  "read_secret",
  "unlock_door",
  "change_robot_mode",
  "export_phi",
];

export const Route = createFileRoute("/pilot")({
  component: PilotPage,
  head: () => pageSeo({ title, description, path }),
});

function PilotPage() {
  const jsonLd = {
    ...webPageJsonLd(path, title, description),
    mainEntity: {
      "@type": "HowTo",
      name: "Run an AI agent safety pilot",
      description,
      step: [
        {
          "@type": "HowToStep",
          name: "Choose one risky action",
          text: "Select one tool call with a real business consequence, such as payments, email, production deploys, record deletion, secrets, or robot access.",
        },
        {
          "@type": "HowToStep",
          name: "Route it through Sanctum",
          text: "Use Connect Agent for a proxy-based path or the SDK/adapters for deeper runtime integration.",
        },
        {
          "@type": "HowToStep",
          name: "Review the runtime decision",
          text: "Show source trust, blast radius, policy reason, approval controls, action token status, and audit trail.",
        },
        {
          "@type": "HowToStep",
          name: "Expand the policy",
          text: "Promote the pilot from one action to a repeatable policy, Shield rule, or fleet-level control.",
        },
      ],
    },
  };

  return (
    <DiscoverPageLayout
      eyebrow="Pilot"
      title="AI Agent Safety Pilot"
      lead="Start with one real action your team cares about. Sanctum verifies it at runtime, shows the operator what is at stake, and records proof before the side effect runs."
    >
      <section>
        <h2>What the pilot proves</h2>
        <p>
          Sanctum is not another prompt rule. It is a runtime decision point between
          agent intent and execution. In a pilot, your team sees an agent propose an
          action, Sanctum evaluates policy and risk, and execution only continues when
          the decision allows it.
        </p>
        <p>
          The outcome is simple: <strong>your AI agent can act, but not without runtime permission.</strong>
        </p>
      </section>

      <section>
        <h2>Best-fit teams</h2>
        <ul>
          {pilotTeams.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>The five-minute path</h2>
        <ol>
          <li>Create or select a Sanctum agent in the console.</li>
          <li>Choose Connect Agent for the fastest proxy path, or the SDK for code-level control.</li>
          <li>Route one realistic tool call through the runtime.</li>
          <li>Review the hold, block, or approval in Live Feed with source trust, blast radius, and policy reason.</li>
          <li>Approve, deny, or convert the observed tool into a standing policy.</li>
        </ol>
        <p>
          <a
            href={consoleUrl}
            onClick={() => trackCta({ location: "pilot_page", cta: "run_console_pilot", destination: "console" })}
          >
            Open the console
          </a>
        </p>
      </section>

      <section>
        <h2>Actions to test first</h2>
        <p>Start where a bad action would be expensive, visible, irreversible, or hard to explain.</p>
        <div className="not-prose grid gap-3 sm:grid-cols-2">
          {pilotActions.map((action) => (
            <div key={action} className="rounded-lg border border-border bg-card/40 p-4 font-mono text-sm text-foreground">
              {action}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>What good looks like</h2>
        <ul>
          <li><strong>Control:</strong> risky actions are held or blocked before execution.</li>
          <li><strong>Context:</strong> operators see actor, tool, source trust, blast radius, and policy reason.</li>
          <li><strong>Proof:</strong> audit logs show who approved, denied, or changed policy.</li>
          <li><strong>Enforcement:</strong> executors can require a signed action token before running.</li>
          <li><strong>Expansion:</strong> the same pattern scales from one tool to a fleet.</li>
        </ul>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </DiscoverPageLayout>
  );
}
