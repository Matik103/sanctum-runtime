import { createFileRoute } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { trackCta } from "@/lib/analytics";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl } from "@/lib/site-links";

const path = "/first-100-users";
const title = "First 100 Users Playbook for AI Agent Security — Sanctum Runtime";
const description =
  "A practical go-to-market and pilot plan for getting the first 100 Sanctum users by protecting one real AI agent action with runtime approval, policy, and audit.";

const audiences = [
  "AI SaaS founders whose agents send email, update CRMs, deploy code, or touch customer data",
  "Platform engineers adding MCP, LangChain, CrewAI, Vercel AI SDK, or OpenAI tool calling to production",
  "Security and compliance leads asked to approve agentic workflows without clear runtime evidence",
  "Robotics, smart-home, and industrial automation teams moving from demos to physical-world autonomy",
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

export const Route = createFileRoute("/first-100-users")({
  component: First100UsersPage,
  head: () => pageSeo({ title, description, path }),
});

function First100UsersPage() {
  const jsonLd = {
    ...webPageJsonLd(path, title, description),
    mainEntity: {
      "@type": "HowTo",
      name: "Run a first-user AI agent security pilot",
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
          name: "Demonstrate the hold",
          text: "Show the operator the source trust, blast radius, policy reason, approval controls, action token, and audit trail.",
        },
        {
          "@type": "HowToStep",
          name: "Invite a narrow buyer segment",
          text: "Offer the same five-minute pilot to agent founders, platform engineers, MCP teams, security teams, and robotics integrators.",
        },
      ],
    },
  };

  return (
    <DiscoverPageLayout
      eyebrow="Go to market"
      title="First 100 Users Playbook"
      lead="The fastest way to earn trust is to show Sanctum blocking or holding one real agent action before it causes damage. This page turns the product into a repeatable pilot for the exact users who already feel the pain."
    >
      <section>
        <h2>The positioning</h2>
        <p>
          Do not lead with generic AI governance. Lead with the visible moment:
          an autonomous agent wants to perform a risky action, Sanctum decides whether it can,
          and the executor refuses to run without approval or a signed action token.
        </p>
        <p>
          The one-line message for early adopters: <strong>Sanctum lets AI agents act,
          but not without runtime permission.</strong>
        </p>
      </section>

      <section>
        <h2>Who to target first</h2>
        <ul>
          {audiences.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>The five-minute demo</h2>
        <ol>
          <li>Create or select a Sanctum agent in the console.</li>
          <li>Use Connect Agent if the buyer wants low setup, or the SDK if they want code-level control.</li>
          <li>Route one realistic tool call through the runtime.</li>
          <li>Show the hold in Live Feed with policy reason, source trust, blast radius, and audit trail.</li>
          <li>Approve, deny, or set a per-tool policy and run the same action again.</li>
        </ol>
        <p>
          <a
            href={consoleUrl}
            onClick={() => trackCta({ location: "first_100_page", cta: "run_console_pilot", destination: "console" })}
          >
            Run the console pilot
          </a>
        </p>
      </section>

      <section>
        <h2>Actions that convert</h2>
        <p>Pick the action that makes the buyer say “we cannot let that run on vibes.”</p>
        <div className="not-prose grid gap-3 sm:grid-cols-2">
          {pilotActions.map((action) => (
            <div key={action} className="rounded-lg border border-border bg-card/40 p-4 font-mono text-sm text-foreground">
              {action}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Acquisition loops</h2>
        <ul>
          <li><strong>Open-source loop:</strong> GitHub README → SDK install → first verified action → console invite.</li>
          <li><strong>SEO loop:</strong> long-tail problem page → five-minute demo → Connect Agent page → Live Feed proof.</li>
          <li><strong>Founder loop:</strong> agent launch checklist → action gate badge → customer trust proof.</li>
          <li><strong>Security loop:</strong> “show me the audit trail” → evidence export → team rollout.</li>
        </ul>
      </section>

      <section>
        <h2>Do less</h2>
        <p>
          Avoid broad platform language when asking people to try Sanctum. The first 100 users need
          one crisp outcome: <strong>protect one risky action today</strong>. The larger autonomy
          infrastructure story lands after the first hold, approval, block, and audit record are real.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </DiscoverPageLayout>
  );
}
