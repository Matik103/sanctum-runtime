import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { billingEmail, consoleUrl, privacyEmail } from "@/lib/site-links";

const path = "/contact";
const title = "Contact — Sanctum Runtime";
const description =
  "Contact Sanctum Runtime for billing support, privacy requests, enterprise sales, and product questions.";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => pageSeo({ title, description, path }),
});

function ContactPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Support"
      title="Contact"
      lead="Sanctum Runtime builds runtime trust infrastructure for autonomous AI — policy enforcement, audit trails, fleet orchestration, and a hosted operator console."
    >
      <p className="text-sm text-muted-foreground">Last updated: May 19, 2026</p>

      <section>
        <h2>Billing and refunds</h2>
        <p>
          Subscription billing, receipts, and refund requests (processed via Paddle):{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
        </p>
      </section>

      <section>
        <h2>Privacy and data requests</h2>
        <p>
          Privacy questions and GDPR-related requests:{" "}
          <a href={`mailto:${privacyEmail}`} className="text-primary hover:underline">
            {privacyEmail}
          </a>
        </p>
      </section>

      <section>
        <h2>Product and console</h2>
        <p>
          Sign in to the{" "}
          <a href={consoleUrl} className="text-primary hover:underline">
            cloud console
          </a>{" "}
          to manage runtimes, policies, and billing. Technical documentation is on our{" "}
          <Link to="/docs/">Documentation</Link> page.
        </p>
      </section>

      <section>
        <h2>Enterprise</h2>
        <p>
          For Enterprise plans, SSO, and custom deployments, email{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>{" "}
          with your organization name and use case.
        </p>
        <p>
          <Link to="/privacy/">Privacy Policy</Link> · <Link to="/terms/">Terms &amp; Conditions</Link> ·{" "}
          <Link to="/refund/">Refund Policy</Link> · <Link to="/pricing/">Pricing</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
