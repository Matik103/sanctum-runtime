import { createFileRoute, Link } from "@tanstack/react-router";
import { SdkSection } from "@/components/SdkSection";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { docsPath, githubUrl } from "@/lib/site-links";

const path = "/sdk";
const title = "Sanctum Runtime SDK — npm, Python & Agent Adapters";
const description =
  "Install @sanctum-runtime/sdk in minutes. JavaScript, Python, LangChain middleware, MCP gates, CLI, and telemetry for production AI agent security.";

export const Route = createFileRoute("/sdk")({
  component: SdkPage,
  head: () => pageSeo({ title, description, path }),
});

function SdkPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Developers"
      title={title}
      lead="Four lines between your model and the real world — verify, govern, and audit without rewriting your stack."
    >
      <SdkSection />
      <section>
        <h2>Packages</h2>
        <ul>
          <li>
            <code>@sanctum-runtime/sdk</code> — core client, middleware, verification types
          </li>
          <li>
            <code>@sanctum-runtime/adapter-agent-runtime</code> — <code>protectAgent()</code> for tool calls
          </li>
          <li>
            <code>sanctum-runtime</code> (Python) — parity client for backends and notebooks
          </li>
          <li>
            <code>@sanctum-runtime/cli</code> — smoke tests and operator utilities
          </li>
        </ul>
        <h2>Telemetry</h2>
        <p>
          OpenTelemetry hooks on the API (`OTEL_EXPORTER_OTLP_ENDPOINT`). Runtime WebSocket heartbeats and usage
          metering feed the hosted dashboard.
        </p>
        <p>
          <a href={githubUrl} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>{" "}
          · <Link to={docsPath}>Integration docs</Link> ·{" "}
          <a href="/ai/sdk.md">sdk.md</a>
        </p>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
