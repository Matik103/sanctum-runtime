import { FormEvent, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Mail, ShieldCheck } from "lucide-react";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { billingEmail, companyLegalName, consoleUrl, privacyEmail, productLegalName, supportEmail } from "@/lib/site-links";

const path = "/contact";
const title = "Contact — Sanctum Runtime";
const description =
  `Contact ${companyLegalName}, operator of ${productLegalName}, for billing support, privacy requests, enterprise sales, and product questions.`;

const salesEmail = billingEmail;

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => pageSeo({ title, description, path }),
});

function ContactPage() {
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("Hosted Connect and production approvals");
  const [timeline, setTimeline] = useState("This month");
  const [details, setDetails] = useState("");

  const salesMailto = useMemo(() => {
    const subject = encodeURIComponent(`Enterprise inquiry for ${productLegalName}`);
    const body = encodeURIComponent(
      [
        `Organization: ${org || ""}`,
        `Work email: ${email || ""}`,
        `Use case: ${useCase}`,
        `Timeline: ${timeline}`,
        "",
        "What needs to be protected?",
        details || "",
      ].join("\n"),
    );
    return `mailto:${salesEmail}?subject=${subject}&body=${body}`;
  }, [details, email, org, timeline, useCase]);

  function handleSalesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = salesMailto;
  }

  return (
    <DiscoverPageLayout
      eyebrow="Contact"
      title="Talk to Sanctum"
      lead={`${productLegalName} is operated by ${companyLegalName}. Tell us what your agents can do in the real world, and we will help you choose the right control path.`}
    >
      <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>

      <section className="rounded-2xl border border-border bg-card/50 p-5">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="mt-4">Enterprise sales</h2>
            <p>
              Use this for private cloud, air-gapped deployments, SSO, compliance review,
              custom retention, procurement, and production rollout planning.
            </p>
            <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <Building2 className="mb-2 h-4 w-4 text-primary" />
                Regulated fleets, robotics, finance, healthcare, and enterprise agent platforms.
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <Mail className="mb-2 h-4 w-4 text-primary" />
                Prefer email? Write to{" "}
                <a href={`mailto:${salesEmail}`} className="text-primary hover:underline">
                  {salesEmail}
                </a>
                .
              </div>
            </div>
          </div>

          <form onSubmit={handleSalesSubmit} className="grid gap-4 rounded-xl border border-border bg-background/70 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Organization
                <input
                  value={org}
                  onChange={(event) => setOrg(event.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                  placeholder="Acme Robotics"
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Work email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                  placeholder="you@company.com"
                  type="email"
                  required
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Need
                <select
                  value={useCase}
                  onChange={(event) => setUseCase(event.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                >
                  <option>Hosted Connect and production approvals</option>
                  <option>Private cloud or air-gapped deployment</option>
                  <option>SSO, RBAC, and compliance evidence</option>
                  <option>Robotics, edge, or physical action gates</option>
                  <option>Security review or procurement</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Timeline
                <select
                  value={timeline}
                  onChange={(event) => setTimeline(event.target.value)}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                >
                  <option>This month</option>
                  <option>This quarter</option>
                  <option>Exploring for later</option>
                  <option>Urgent incident or launch</option>
                </select>
              </label>
            </div>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              What actions should Sanctum control?
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                className="min-h-32 rounded-lg border border-border bg-card px-3 py-3 text-foreground outline-none focus:border-primary"
                placeholder="Payments, email sends, deployments, MCP tools, robot movement, home access, customer data..."
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground"
            >
              Contact sales
            </button>
            <p className="text-xs text-muted-foreground">
              The form opens your email client with these details prefilled so you can review before sending.
            </p>
          </form>
        </div>
      </section>

      <section>
        <h2>Company</h2>
        <p>
          Legal entity: <strong>{companyLegalName}</strong>
          <br />
          Product/service: <strong>{productLegalName}</strong>
        </p>
      </section>

      <section>
        <h2>Billing and refunds</h2>
        <p>
          Subscription billing, receipts, and refund requests (processed through Creem or another
          authorized payment provider):{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
        </p>
      </section>

      <section>
        <h2>Product support</h2>
        <p>
          Account, console, API, and technical support:{" "}
          <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
            {supportEmail}
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
          For Enterprise plans, SSO, and custom deployments, use the sales form above or email{" "}
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
