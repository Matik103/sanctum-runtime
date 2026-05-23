import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { privacyEmail } from "@/lib/site-links";

const path = "/privacy";
const title = "Privacy Policy — Sanctum Runtime";
const description =
  "How Sanctum Runtime collects, uses, retains, and protects operator data, audit logs, API keys, and enterprise SSO configuration.";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => pageSeo({ title, description, path }),
});

function PrivacyPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Privacy Policy"
      lead="Sanctum Runtime (“we”, “us”, “our”) provides runtime trust infrastructure for autonomous AI systems. This policy explains what we collect, why we collect it, and the choices you have."
    >
      <p className="text-sm text-muted-foreground">Last updated: April 30, 2026</p>

      <section>
        <h2>1. Data we collect</h2>
        <p>We may collect:</p>
        <ul>
          <li>
            <strong>Account information</strong> — name, email, and authentication metadata when you
            sign in to the cloud console (via our identity provider).
          </li>
          <li>
            <strong>Organization and fleet data</strong> — organization name, runtime registrations,
            agent metadata, deployment groups, and configuration you submit.
          </li>
          <li>
            <strong>Policy and audit data</strong> — action names, policy decisions, risk scores,
            verification states, human resolutions, correlation IDs, and related context needed to
            operate the runtime and compliance features.
          </li>
          <li>
            <strong>API keys</strong> — key names, prefixes, and hashed secrets (we never store full
            API key values after creation).
          </li>
          <li>
            <strong>Usage and billing metadata</strong> — plan tier, metered usage events, and payment
            references processed by our billing provider.
          </li>
          <li>
            <strong>Enterprise SSO configuration</strong> — OIDC issuer, client ID, and encrypted client
            secrets you provide for per-organization login.
          </li>
          <li>
            <strong>Technical logs</strong> — IP addresses, request metadata, and security logs needed
            to operate, debug, and protect the service.
          </li>
        </ul>
        <p>
          Content your agents or robots send through the runtime (actions, context, prompts) is processed
          to enforce policy and may be stored in audit logs according to your plan retention settings.
        </p>
      </section>

      <section>
        <h2>2. How we use data</h2>
        <p>We use data to:</p>
        <ul>
          <li>Provide, operate, and secure the Sanctum Runtime API and cloud console</li>
          <li>Enforce policies, human-in-the-loop verification, and audit trails</li>
          <li>Support billing, entitlements, and plan limits</li>
          <li>Configure enterprise SSO and fleet orchestration</li>
          <li>Prevent abuse, fraud, and unauthorized access</li>
          <li>Comply with legal obligations and respond to lawful requests</li>
          <li>Communicate service updates and support responses</li>
        </ul>
      </section>

      <section>
        <h2>3. AI and infrastructure processing</h2>
        <p>
          Optional risk models may process action context to score risk. You control whether cloud AI
          providers are enabled in your deployment. Infrastructure providers (hosting, database,
          authentication, email, analytics, and payments) process data only as needed to run the
          service.
        </p>
      </section>

      <section>
        <h2>4. Sharing</h2>
        <p>
          We share data only with service providers required to operate Sanctum Runtime (for example
          hosting, Supabase authentication and database, payment processing, and email) or when
          required by law. We do not sell personal information.
        </p>
      </section>

      <section>
        <h2>5. Retention and deletion</h2>
        <p>
          We retain data only as long as needed for the purposes above. Retention for audit and usage
          data depends on your plan (see{" "}
          <Link to="/billing/" className="text-primary hover:underline">
            Billing
          </Link>
          ). You may export organization data from the console where available (GDPR export). You may
          request deletion by contacting us; some records may be retained where required by law.
        </p>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          We use reasonable technical and organizational safeguards, including encryption for sensitive
          configuration (such as SSO client secrets), access controls, and rate limiting. No service is
          100% secure — protect your credentials, API keys, and devices.
        </p>
      </section>

      <section>
        <h2>7. Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access, correct, export, delete, or
          restrict processing of your personal data. Use in-app export where available or contact us
          below.
        </p>
      </section>

      <section>
        <h2>8. International transfers</h2>
        <p>
          Data may be processed in the United States and other countries where our providers operate.
          We rely on appropriate safeguards where required by applicable law.
        </p>
      </section>

      <section>
        <h2>9. Contact</h2>
        <p>
          Privacy requests:{" "}
          <a href={`mailto:${privacyEmail}`} className="text-primary hover:underline">
            {privacyEmail}
          </a>
        </p>
        <p>
          See also: <Link to="/terms/">Terms &amp; Conditions</Link>, <Link to="/refund/">Refund Policy</Link>,{" "}
          <Link to="/billing/">Billing</Link>, <Link to="/pricing/">Pricing</Link>,{" "}
          <Link to="/contact/">Contact</Link>, <Link to="/cookies/">Cookies</Link>.
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
