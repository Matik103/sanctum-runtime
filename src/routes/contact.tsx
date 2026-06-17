import { FormEvent, useState } from "react";
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

type SubmitState = "idle" | "submitting" | "success" | "error";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => pageSeo({ title, description, path }),
});

function ContactPage() {
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [useCase, setUseCase] = useState("Hosted Connect + approvals");
  const [timeline, setTimeline] = useState("This month");
  const [details, setDetails] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  async function handleSalesSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState("submitting");
    setSubmitMessage("");

    try {
      const response = await fetch("/api/contact-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization: org,
          email,
          need: useCase,
          timeline,
          details,
          path: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : path,
        }),
      });

      if (!response.ok) {
        throw new Error(`submit_failed_${response.status}`);
      }

      setSubmitState("success");
      setSubmitMessage("Thanks. Your request was sent to Sanctum sales. We will reply by email.");
      setOrg("");
      setEmail("");
      setUseCase("Hosted Connect + approvals");
      setTimeline("This month");
      setDetails("");
    } catch {
      setSubmitState("error");
      setSubmitMessage(`We could not submit the form. Email ${salesEmail} and we will help from there.`);
    }
  }

  return (
    <DiscoverPageLayout
      eyebrow="Contact"
      title="Talk to Sanctum"
      lead={`${productLegalName} is operated by ${companyLegalName}. Tell us what your agents can do in the real world, and we will help you choose the right control path.`}
    >
      <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>

      <section className="overflow-hidden rounded-2xl border border-border bg-card/50 p-5 sm:p-6">
        <div className="grid min-w-0 gap-8 xl:grid-cols-[0.9fr_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="mt-4">Enterprise sales</h2>
            <p>
              Use this for private cloud, air-gapped deployments, SSO, compliance review,
              custom retention, procurement, and production rollout planning.
            </p>
            <div className="mt-5 grid min-w-0 gap-3 text-sm text-muted-foreground md:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-border bg-background/70 p-4">
                <Building2 className="mb-2 h-4 w-4 text-primary" />
                Regulated fleets, robotics, finance, healthcare, and enterprise agent platforms.
              </div>
              <div className="min-w-0 rounded-xl border border-border bg-background/70 p-4">
                <Mail className="mb-2 h-4 w-4 text-primary" />
                Prefer email? Write to{" "}
                <a href={`mailto:${salesEmail}`} className="break-all text-primary hover:underline">
                  {salesEmail}
                </a>
                .
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSalesSubmit}
            className="grid min-w-0 gap-5 rounded-xl border border-border bg-background/70 p-4 sm:p-5"
          >
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground">
                Organization
                <input
                  value={org}
                  onChange={(event) => setOrg(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                  placeholder="Acme Robotics"
                  required
                />
              </label>
              <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground">
                Work email
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                  placeholder="you@company.com"
                  type="email"
                  required
                />
              </label>
            </div>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground">
                Need
                <select
                  value={useCase}
                  onChange={(event) => setUseCase(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                >
                  <option>Hosted Connect + approvals</option>
                  <option>Private cloud or air gap</option>
                  <option>SSO, RBAC, compliance</option>
                  <option>Robotics or physical gates</option>
                  <option>Security review</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground">
                Timeline
                <select
                  value={timeline}
                  onChange={(event) => setTimeline(event.target.value)}
                  className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-foreground outline-none focus:border-primary"
                >
                  <option>This month</option>
                  <option>This quarter</option>
                  <option>Exploring for later</option>
                  <option>Urgent incident or launch</option>
                </select>
              </label>
            </div>
            <label className="grid min-w-0 gap-2 text-sm font-medium text-foreground">
              What actions should Sanctum control?
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                className="min-h-32 w-full min-w-0 resize-y rounded-lg border border-border bg-card px-3 py-3 text-foreground outline-none focus:border-primary"
                placeholder="Payments, email sends, deployments, MCP tools, robot movement, home access, customer data..."
              />
            </label>
            <button
              type="submit"
              disabled={submitState === "submitting"}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 py-2 font-semibold text-primary-foreground"
            >
              {submitState === "submitting" ? "Sending..." : "Contact sales"}
            </button>
            {submitMessage ? (
              <p
                className={
                  submitState === "success"
                    ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                    : "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                }
              >
                {submitMessage}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This submits directly to {salesEmail}. We use your work email only to reply.
              </p>
            )}
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
