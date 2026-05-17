import { createFileRoute, Link } from "@tanstack/react-router";
import { Architecture } from "@/components/Architecture";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { docsPath } from "@/lib/site-links";

const path = "/architecture";
const title = "Sanctum Runtime Architecture";
const description =
  "Architecture of Sanctum Runtime: SDK and adapters, verification API, policy engine, event pipeline, orchestration, and cloud control plane.";

export const Route = createFileRoute("/architecture")({
  component: ArchitecturePage,
  head: () => pageSeo({ title, description, path }),
});

function ArchitecturePage() {
  return (
    <DiscoverPageLayout
      eyebrow="Architecture"
      title={title}
      lead="Machine-readable overview of how Sanctum connects agents, operators, and physical systems."
    >
      <Architecture />
      <section>
        <h2>Components</h2>
        <h3>Client SDK (`@sanctum-runtime/sdk`)</h3>
        <p>
          TypeScript and Python clients call <code>POST /v1/actions/verify</code>, manage policies, and
          stream events. The agent-runtime adapter wraps LangChain-style tools with{" "}
          <code>protectAgent()</code>.
        </p>
        <h3>Runtime API (Fastify)</h3>
        <p>
          Verification, audit, API keys, fleet map, marketplace installs, billing, GDPR export, and SSO
          configuration. Deployed at <code>api.sanctumruntime.com</code>.
        </p>
        <h3>Control plane (Supabase + dashboard)</h3>
        <p>
          Operators authenticate via Supabase JWT. Policies persist per org; verifications appear in the
          review queue; webhooks notify Slack, email, or custom endpoints.
        </p>
        <h3>Event pipeline</h3>
        <p>
          SSE <code>/v1/events/stream</code> and WebSocket <code>/v1/runtimes/ws</code> feed live runtime
          status. Audit records support human resolve with correlation IDs.
        </p>
      </section>
      <p>
        <Link to={docsPath}>Deep dive in docs</Link> ·{" "}
        <a href="/ai/architecture.md">architecture.md (AI-friendly)</a>
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
