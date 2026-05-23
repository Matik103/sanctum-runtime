import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { consoleUrl, privacyEmail } from "@/lib/site-links";

const path = "/cookies";
const title = "Cookies — Sanctum Runtime";
const description =
  "How Sanctum Runtime uses cookies and similar technologies on the marketing site and cloud console.";

export const Route = createFileRoute("/cookies")({
  component: CookiesPage,
  head: () => pageSeo({ title, description, path }),
});

function CookiesPage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Cookies"
      lead="This page explains how we use cookies and similar technologies on our websites and hosted products."
    >
      <p className="text-sm text-muted-foreground">Last updated: April 30, 2026</p>

      <section>
        <h2>1. What are cookies?</h2>
        <p>
          Cookies are small text files stored on your device. We also use similar technologies (such as
          local storage) for authentication and preferences.
        </p>
      </section>

      <section>
        <h2>2. Marketing site (sanctumruntime.com)</h2>
        <p>This site may use:</p>
        <ul>
          <li>
            <strong>Essential cookies</strong> — required for security, load balancing, or basic site
            function (for example from our CDN or hosting provider).
          </li>
          <li>
            <strong>Analytics cookies</strong> — only if we enable analytics; used to understand traffic
            and improve content.
          </li>
        </ul>
        <p>We do not use cookies on the marketing site to sell your data.</p>
      </section>

      <section>
        <h2>3. Cloud console</h2>
        <p>
          The operator console at{" "}
          <a href={consoleUrl} className="text-primary hover:underline">
            console.sanctumruntime.com
          </a>{" "}
          uses cookies and local storage for sign-in sessions (via our authentication provider), security,
          and user preferences. These are necessary to operate your account.
        </p>
      </section>

      <section>
        <h2>4. Your choices</h2>
        <p>
          You can block or delete cookies in your browser settings. Blocking essential cookies may prevent
          sign-in or certain features from working.
        </p>
      </section>

      <section>
        <h2>5. Contact</h2>
        <p>
          Questions:{" "}
          <a href={`mailto:${privacyEmail}`} className="text-primary hover:underline">
            {privacyEmail}
          </a>
        </p>
        <p>
          <Link to="/privacy/">Privacy Policy</Link> · <Link to="/terms/">Terms</Link> ·{" "}
          <Link to="/billing/">Billing</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
