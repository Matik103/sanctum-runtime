import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { docsPath } from "@/lib/site-links";

const path = "/security";
const title = "Security & Trust — Sanctum Runtime";
const description =
  "Runtime verification, API key hashing, optional hardware attestation, SSO, encryption roadmap, and audit evidence for enterprise autonomous systems.";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
  head: () => pageSeo({ title, description, path }),
});

function SecurityPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Security"
      title={title}
      lead="Sanctum is designed for operators who must prove what an autonomous system did, who approved it, and whether policy was enforced before execution."
    >
      <section>
        <h2>Runtime verification</h2>
        <p>
          Every action receives a correlation ID, policy decision, and optional human review. Decisions are
          immutable in the audit log; resolve events are recorded separately.
        </p>
      </section>
      <section>
        <h2>Authentication & keys</h2>
        <ul>
          <li>Dashboard: Supabase JWT (Bearer)</li>
          <li>Automation: peppered bcrypt API keys (`sk_sanctum_*`)</li>
          <li>Legacy server key optional for scripts</li>
        </ul>
      </section>
      <section>
        <h2>Attestation & zero trust</h2>
        <p>
          Optional hardware attestation (TPM quotes) binds runtimes to devices. Fleet map shows trust state per
          runtime. Policies fail closed when verification cannot complete.
        </p>
      </section>
      <section>
        <h2>Enterprise controls</h2>
        <ul>
          <li>OIDC SSO (Google, Microsoft Entra) for Team/Enterprise plans</li>
          <li>GDPR data export API</li>
          <li>Rate limiting, Helmet headers, structured audit export</li>
          <li>SSO client secrets encrypted at rest (operator-configured key)</li>
        </ul>
      </section>
      <section>
        <h2>Compliance roadmap</h2>
        <p>
          SOC 2 and regional data residency are on the enterprise track. Open-core boundary documented in{" "}
          <Link to={docsPath}>open core</Link>.
        </p>
      </section>
      <p>
        <a href="/ai/security.md">security.md</a> for AI retrieval
      </p>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
