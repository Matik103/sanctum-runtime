import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { billingEmail, companyLegalName, productLegalName } from "@/lib/site-links";

const path = "/refund";
const title = "Refund and Dispute Policy — Sanctum Runtime";
const description =
  `Refunds, subscription cancellation, and payment disputes for ${productLegalName} subscriptions operated by ${companyLegalName}.`;

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => pageSeo({ title, description, path }),
});

function RefundPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Refund and Dispute Policy"
      lead={`${productLegalName} is operated by ${companyLegalName}. This policy explains how refunds and billing disputes work for paid subscriptions.`}
    >
      <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>

      <section>
        <h2>Merchant and product</h2>
        <p>
          <strong>{companyLegalName}</strong> operates <strong>{productLegalName}</strong>, a runtime
          trust service for autonomous AI systems including policy enforcement, audit trails, fleet
          visibility, and a hosted cloud console.
        </p>
      </section>

      <section>
        <h2>Payment processor</h2>
        <p>
          Refunds, withdrawals, and payment disputes for {productLegalName} subscriptions are handled by
          our authorized merchant/payment provider (including <strong>Paddle</strong> or <strong>Creem</strong> where available),
          under the active buyer terms and refund policy presented at checkout.
        </p>
      </section>

      <section>
        <h2>Refund eligibility</h2>
        <p>
          You can request a refund within <strong>14 days</strong> of the original purchase date (or
          longer if local consumer law requires it). Refund eligibility may depend on the payment
          provider&apos;s buyer terms, the applicable subscription state, usage, and local law.
        </p>
      </section>

      <section>
        <h2>How to request a refund or cancel billing</h2>
        <p>
          To request a refund or cancel recurring billing, use the &quot;View receipt&quot; or
          &quot;Manage subscription&quot; links in your payment confirmation email, or contact buyer
          support from your Creem/payment-provider receipt.
        </p>
        <p>
          You can also manage your plan from the{" "}
          <a href="https://console.sanctumruntime.com" className="text-primary hover:underline">
            Sanctum cloud console
          </a>{" "}
          under Billing.
        </p>
      </section>

      <section>
        <h2>Subscription cancellation</h2>
        <p>
          Subscription cancellation takes effect at the end of your current billing period and prevents
          future charges. Completed billing periods are handled under the payment provider&apos;s refund
          rules and applicable consumer law.
        </p>
      </section>

      <section>
        <h2>Disputes and billing support</h2>
        <p>
          For disputes and billing support, contact{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
          .
        </p>
        <p>
          <Link to="/terms/">Terms &amp; Conditions</Link> · <Link to="/privacy/">Privacy Policy</Link> ·{" "}
          <Link to="/billing/">Billing</Link> · <Link to="/pricing/">Pricing</Link> ·{" "}
          <Link to="/contact/">Contact</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
