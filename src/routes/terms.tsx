import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { acceptableUseUrl, billingEmail, companyLegalName, productLegalName, supportEmail } from "@/lib/site-links";

const path = "/terms";
const title = "Terms & Conditions — Sanctum Runtime";
const description =
  `Terms governing use of ${productLegalName}, operated by ${companyLegalName}.`;

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => pageSeo({ title, description, path }),
});

function TermsPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Terms & Conditions"
      lead={`${productLegalName} is operated by ${companyLegalName}. These terms govern your access to and use of the website, cloud console, APIs, and related services.`}
    >
      <p className="text-sm text-muted-foreground">Last updated: June 3, 2026</p>

      <section>
        <h2>Merchant and contracting entity</h2>
        <p>
          These Terms &amp; Conditions are between you and <strong>{companyLegalName}</strong>, the
          company that operates <strong>{productLegalName}</strong>. References to “Sanctum”, “Sanctum
          Runtime”, “we”, “us”, or “our” mean {companyLegalName} acting through the Sanctum Runtime
          product and services.
        </p>
      </section>

      <section>
        <h2>1. Agreement</h2>
        <p>
          By accessing or using {productLegalName}, you agree to these Terms and our{" "}
          <Link to="/privacy">Privacy Policy</Link>. If you use the service on behalf of an organization,
          you represent that you have authority to bind that organization.
        </p>
      </section>

      <section>
        <h2>2. Service</h2>
        <p>
          {productLegalName} provides runtime verification, policy enforcement, audit logging, and related operator
          tools. Features vary by plan. We may modify or discontinue features with reasonable notice where
          practicable.
        </p>
        <p>
          {productLegalName} is not an official product of OpenAI, Anthropic, Google, Meta, DeepSeek, xAI, NVIDIA,
          or any other model provider. Connect Agent and related proxy features let customers route
          requests to third-party AI platforms using credentials and configurations they control.
        </p>
      </section>

      <section>
        <h2>3. Accounts and security</h2>
        <p>
          You are responsible for safeguarding credentials, API keys, and access to your organization. You
          must not share API keys in public repositories or client-side code. Notify us promptly of
          unauthorized use.
        </p>
      </section>

      <section>
        <h2>4. AI responsibility and outputs</h2>
        <p>
          You are responsible for the agents, tools, prompts, model providers, credentials, workflows,
          and runtime policies you connect to Sanctum. AI outputs and autonomous actions may be wrong,
          unsafe, biased, incomplete, or unexpected. You must evaluate, test, supervise, and approve
          deployments before using them in production or high-impact environments.
        </p>
      </section>

      <section>
        <h2>5. Acceptable use</h2>
        <p>
          You agree to follow our <Link to={acceptableUseUrl}>Acceptable Use Policy</Link>. You must not:
        </p>
        <ul>
          <li>Violate applicable law or third-party rights</li>
          <li>Probe, scan, or attack the service without authorization</li>
          <li>Interfere with other users or overload infrastructure</li>
          <li>Use the service to develop, deploy, or coordinate malware, credential theft, phishing, fraud, or unlawful autonomous systems</li>
          <li>Use the service to bypass third-party model provider terms, safety policies, rate limits, or access controls</li>
          <li>Connect agents to physical, financial, medical, legal, or safety-critical systems without appropriate authorization, safeguards, testing, and human oversight</li>
          <li>Reverse engineer hosted components except where permitted by open-source licenses</li>
        </ul>
      </section>

      <section>
        <h2>6. Subscriptions and payments</h2>
        <p>
          Paid plans are shown before checkout and may be sold by {companyLegalName} and processed
          through Creem or another authorized merchant/payment provider. You authorize recurring charges for the selected subscription until
          cancelled. Taxes, receipts, card processing, and payment disputes may be handled by the
          payment provider under the buyer terms shown at checkout. See our <Link to="/billing">Billing</Link>{" "}
          and <Link to="/refund">Refund Policy</Link> pages for more detail.
        </p>
      </section>

      <section>
        <h2>7. Open source</h2>
        <p>
          Components released under open-source licenses are governed by those licenses in addition to
          these Terms for the hosted service.
        </p>
      </section>

      <section>
        <h2>8. Disclaimer</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” WITHOUT WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, OR NON-INFRINGEMENT. {productLegalName} does not guarantee that autonomous actions will be safe
          in all environments — you remain responsible for deployment, testing, and human oversight.
        </p>
      </section>

      <section>
        <h2>9. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, {companyLegalName.toUpperCase()}, {productLegalName.toUpperCase()}, AND THEIR SUPPLIERS WILL NOT BE LIABLE FOR
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA,
          OR GOODWILL. OUR AGGREGATE LIABILITY FOR CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE
          AMOUNTS YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM (OR ONE HUNDRED US DOLLARS IF NO
          FEES WERE PAID).
        </p>
      </section>

      <section>
        <h2>10. Termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or terminate access for breach of
          these Terms or to protect the service. Provisions that by nature should survive will survive
          termination.
        </p>
      </section>

      <section>
        <h2>11. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict
          of law principles, except where mandatory local law applies.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          Legal entity: <strong>{companyLegalName}</strong>, operator of {productLegalName}.
        </p>
        <p>
          Questions:{" "}
          <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
            {supportEmail}
          </a>
        </p>
        <p>
          Billing:{" "}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
        </p>
        <p>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/refund">Refund Policy</Link> ·{" "}
          <Link to={acceptableUseUrl}>Acceptable Use</Link> · <Link to="/billing">Billing</Link> · <Link to="/pricing">Pricing</Link> ·{" "}
          <Link to="/contact">Contact</Link> · <Link to="/cookies">Cookies</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
