import { createFileRoute } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";

const path = "/glossary";
const title = "Glossary — Sanctum Runtime";
const description =
  "Definitions of runtime trust, orchestration, agent governance, attestation, embodied AI, and related terms used in Sanctum Runtime.";

const terms: { term: string; definition: string }[] = [
  {
    term: "Runtime",
    definition:
      "The execution environment where agent or robot actions are intercepted, evaluated, and optionally blocked before side effects occur.",
  },
  {
    term: "Trusted runtime",
    definition:
      "A runtime that enforces policy, produces audit evidence, and supports human verification for high-risk actions.",
  },
  {
    term: "Orchestration",
    definition:
      "Coordinating multiple agents, runtimes, or deployment groups — dispatch, fleet map, and policy sync across environments.",
  },
  {
    term: "Agent",
    definition:
      "An autonomous software actor (LLM tool loop, workflow bot, or embodied controller) that proposes actions to Sanctum for verification.",
  },
  {
    term: "Action verification",
    definition:
      "The process of submitting an action + context to Sanctum and receiving approve, verify (HITL), or block.",
  },
  {
    term: "Attestation",
    definition:
      "Cryptographic proof that a runtime connects from expected hardware (e.g. TPM PCR quotes).",
  },
  {
    term: "Embodied AI",
    definition:
      "AI systems that act in the physical world — robots, drones, smart home actuators, industrial controllers.",
  },
  {
    term: "Runtime governance",
    definition:
      "Organization-wide policies, quotas, SSO, audit export, and operator workflows over autonomous execution.",
  },
  {
    term: "Control plane",
    definition:
      "Hosted dashboard and API backing orgs, billing, fleet visibility, and notification channels.",
  },
  {
    term: "Open core",
    definition:
      "MIT-licensed SDK, policy engine, and local runtime; enterprise intelligence and hosted fleet features are commercial.",
  },
];

export const Route = createFileRoute("/glossary")({
  component: GlossaryPage,
  head: () => pageSeo({ title, description, path }),
});

function GlossaryPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Glossary"
      title={title}
      lead="Structured definitions for search engines, AI retrieval systems, and engineering onboarding."
    >
      <dl className="space-y-8">
        {terms.map(({ term, definition }) => (
          <div key={term}>
            <dt className="text-lg font-semibold text-foreground">{term}</dt>
            <dd className="mt-2 text-muted-foreground">{definition}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8">
        <a href="/ai/glossary.md">glossary.md</a> (plain markdown for LLM crawlers)
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            ...webPageJsonLd(path, title, description),
            "@type": "DefinedTermSet",
            hasDefinedTerm: terms.map((t) => ({
              "@type": "DefinedTerm",
              name: t.term,
              description: t.definition,
            })),
          }),
        }}
      />
    </DiscoverPageLayout>
  );
}
