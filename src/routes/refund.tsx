import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { billingEmail } from "@/lib/site-links";

const path = "/refund";
const title = "Refund and Dispute Policy — Sanctum Runtime";
const description =
  "Refunds, subscription cancellation, and payment disputes for Sanctum Runtime cloud subscriptions processed via Paddle.";

export const Route = createFileRoute("/refund")({
  component: RefundPage,
  head: () => pageSeo({ title, description, path }),
});

function RefundPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Refund and Dispute Policy"
      lead="Sanctum Runtime provides runtime trust infrastructure for autonomous AI systems — policy enforcement, audit trails, fleet visibility, and a hosted cloud console. This policy explains how refunds and billing disputes work for paid subscriptions."
    >
      <p className="text-sm text-muted-foreground">Last updated: May 19, 2026</p>

      <section>
        <h2>Payment processor</h2>
        <p>
          Refunds, withdrawals, and payment disputes for Sanctum Runtime subscriptions are handled by
          our authorized reseller (currently <strong>Paddle</strong>), under the active buyer terms and
          refund policy presented at checkout.
        </p>
      </section>

      <section>
        <h2>Refund eligibility</h2>
        <p>
          You can request a refund within <strong>14 days</strong> of the original purchase date (or
          longer if local consumer law requires it). Paddle applies final eligibility under Paddle
          policy and applicable law.
        </p>
      </section>

      <section>
        <h2>How to request a refund or cancel billing</h2>
        <p>
          To request a refund or cancel recurring billing, use the &quot;View receipt&quot; or
          &quot;Manage subscription&quot; links in your payment confirmation email, or contact buyer
          support from your payment receipt.
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
          future charges. Completed billing periods are handled under Paddle&apos;s refund rules.
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
          <Link to="/terms">Terms &amp; Conditions</Link> · <Link to="/privacy">Privacy Policy</Link> ·{" "}
          <Link to="/billing">Billing</Link> · <Link to="/pricing">Pricing</Link> ·{" "}
          <Link to="/contact">Contact</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
