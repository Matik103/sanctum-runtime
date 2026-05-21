import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { privacyEmail } from "@/lib/site-links";

const path = "/terms";
const title = "Terms & Conditions — Sanctum Runtime";
const description =
  "Terms governing use of the Sanctum Runtime website, cloud console, API, and related services.";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => pageSeo({ title, description, path }),
});

function TermsPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Terms & Conditions"
      lead="These terms govern your access to and use of Sanctum Runtime websites, the cloud console, APIs, and related services."
    >
      <p className="text-sm text-muted-foreground">Last updated: April 30, 2026</p>

      <section>
        <h2>1. Agreement</h2>
        <p>
          By accessing or using Sanctum Runtime, you agree to these Terms and our{" "}
          <Link to="/privacy">Privacy Policy</Link>. If you use the service on behalf of an organization,
          you represent that you have authority to bind that organization.
        </p>
      </section>

      <section>
        <h2>2. Service</h2>
        <p>
          Sanctum provides runtime verification, policy enforcement, audit logging, and related operator
          tools. Features vary by plan. We may modify or discontinue features with reasonable notice where
          practicable.
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
        <h2>4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Violate applicable law or third-party rights</li>
          <li>Probe, scan, or attack the service without authorization</li>
          <li>Interfere with other users or overload infrastructure</li>
          <li>Use the service to develop malware or unlawful autonomous systems</li>
          <li>Reverse engineer hosted components except where permitted by open-source licenses</li>
        </ul>
      </section>

      <section>
        <h2>5. Open source</h2>
        <p>
          Components released under open-source licenses are governed by those licenses in addition to
          these Terms for the hosted service.
        </p>
      </section>

      <section>
        <h2>6. Disclaimer</h2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” WITHOUT WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
          PURPOSE, OR NON-INFRINGEMENT. Sanctum does not guarantee that autonomous actions will be safe
          in all environments — you remain responsible for deployment, testing, and human oversight.
        </p>
      </section>

      <section>
        <h2>7. Limitation of liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, SANCTUM AND ITS SUPPLIERS WILL NOT BE LIABLE FOR
          INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA,
          OR GOODWILL. OUR AGGREGATE LIABILITY FOR CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE
          AMOUNTS YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM (OR ONE HUNDRED US DOLLARS IF NO
          FEES WERE PAID).
        </p>
      </section>

      <section>
        <h2>8. Termination</h2>
        <p>
          You may stop using the service at any time. We may suspend or terminate access for breach of
          these Terms or to protect the service. Provisions that by nature should survive will survive
          termination.
        </p>
      </section>

      <section>
        <h2>9. Governing law</h2>
        <p>
          These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict
          of law principles, except where mandatory local law applies.
        </p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p>
          Questions:{" "}
          <a href={`mailto:${privacyEmail}`} className="text-primary hover:underline">
            {privacyEmail}
          </a>
        </p>
        <p>
          <Link to="/privacy">Privacy Policy</Link> · <Link to="/refund">Refund Policy</Link> ·{" "}
          <Link to="/billing">Billing</Link> · <Link to="/pricing">Pricing</Link> ·{" "}
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
