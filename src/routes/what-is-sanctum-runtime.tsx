import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl, docsPath, githubUrl } from "@/lib/site-links";

const path = "/what-is-sanctum-runtime";
const title = "What is Sanctum Runtime? AI Trust Layer for Autonomous Systems";
const description =
  "Sanctum Runtime is the execution trust layer between AI reasoning and real-world actions — runtime authorization, policy gates, audit trails, and human-in-the-loop verification.";

export const Route = createFileRoute("/what-is-sanctum-runtime")({
  component: WhatIsPage,
  head: () => pageSeo({ title, description, path }),
});

function WhatIsPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Definition"
      title={title}
      lead="Sanctum Runtime sits between models and execution. Every high-stakes action is evaluated against policy before it runs — locally, offline-capable, with a full audit trail."
    >
      <section>
        <h2>Trusted runtime, not just a guardrail library</h2>
        <p>
          A <strong>trusted runtime</strong> intercepts actions at execution time: send email, move a robot,
          unlock a door, call an API. The runtime returns approve, verify (human-in-the-loop), or block —
          then records evidence for operators and compliance systems.
        </p>
      </section>
      <section>
        <h2>Runtime orchestration for embodied AI</h2>
        <p>
          <strong>Embodied AI</strong> and fleet deployments need more than prompt safety. Sanctum connects
          runtimes to a control plane: policies sync across deploys, events stream to your dashboard, and
          operators resolve verifications from a single console.
        </p>
      </section>
      <section>
        <h2>Agent governance</h2>
        <ul>
          <li>Policy engine: approve, verify, or block per action type</li>
          <li>Offline heuristics and local LLM risk scoring (open core)</li>
          <li>Audit log, webhooks, and marketplace adapters (ROS2, agents, smart home)</li>
          <li>Hosted console for fleet map, billing, and enterprise SSO</li>
        </ul>
      </section>
      <section>
        <h2>Get started</h2>
        <p>
          <a href={consoleUrl}>Open the console</a> · <Link to={docsPath}>Read the docs</Link> ·{" "}
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            View source on GitHub
          </a>
        </p>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
