import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { billingEmail, companyLegalName, productLegalName } from "@/lib/site-links";

const path = "/billing";
const title = "Billing — Sanctum Runtime";
const description =
  `Subscription plans, billing cycles, refunds, and payment processing for ${productLegalName}, operated by ${companyLegalName}.`;

export const Route = createFileRoute("/billing")({
  component: BillingPage,
  head: () => pageSeo({ title, description, path }),
});

function BillingPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Billing"
      lead={`${productLegalName} is operated by ${companyLegalName}. This page describes how paid plans, subscriptions, and usage limits work for the cloud services.`}
    >
      <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>

      <section>
        <h2>Merchant and product</h2>
        <p>
          <strong>{companyLegalName}</strong> operates <strong>{productLegalName}</strong>. Paid plans
          provide access to hosted runtime trust services, including the cloud console, API usage,
          policy enforcement, audit retention, and related operator features.
        </p>
      </section>

      <section>
        <h2>1. Plans</h2>
        <p>
          We offer multiple plans (for example Developer, Operator, Team, and Enterprise) with different
          limits on runtimes, agents, events, retention, and features such as SSO and compliance export.
          Current limits are shown in the cloud console and may change with notice.
        </p>
      </section>

      <section>
        <h2>2. Payment</h2>
        <p>
          Paid subscriptions are processed by Paddle, Creem, or another authorized merchant/payment provider. By
          subscribing, you authorize recurring charges according to your selected plan and billing
          cycle. Prices are shown before purchase and may exclude applicable taxes.
        </p>
      </section>

      <section>
        <h2>3. Trials and upgrades</h2>
        <p>
          Trial or promotional access may be offered at our discretion. Upgrading or downgrading may
          adjust entitlements immediately or at the next billing period as shown at checkout.
        </p>
      </section>

      <section>
        <h2>4. Cancellations and refunds</h2>
        <p>
          You may cancel a subscription according to the process in the console or payment provider
          portal. Refunds and disputes are handled as described in our{" "}
          <Link to="/refund/">Refund and Dispute Policy</Link>. After cancellation, you may retain
          access until the end of the paid period; data retention follows your plan and our{" "}
          <Link to="/privacy/">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>5. Usage metering</h2>
        <p>
          Some features are metered (for example action verifications or stored events). Overage may be
          blocked or billed as described in your plan. We may apply rate limits to protect the service.
        </p>
      </section>

      <section>
        <h2>6. Free tier</h2>
        <p>
          Free plans are provided without guaranteed availability or support SLAs. We may modify free-tier
          limits with reasonable notice.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          Billing questions:{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
        </p>
        <p>
          <Link to="/terms/">Terms &amp; Conditions</Link> · <Link to="/privacy/">Privacy Policy</Link>{" "}
          · <Link to="/refund/">Refund Policy</Link> · <Link to="/pricing/">Pricing</Link> ·{" "}
          <Link to="/contact/">Contact</Link> · <Link to="/cookies/">Cookies</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
