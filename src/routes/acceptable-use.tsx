import { createFileRoute, Link } from "@tanstack/react-router";
import { DiscoverPageLayout } from "@/components/DiscoverPageLayout";
import { pageSeo, webPageJsonLd } from "@/lib/seo";
import { supportEmail } from "@/lib/site-links";

const path = "/acceptable-use";
const title = "Acceptable Use Policy — Sanctum Runtime";
const description =
  "Acceptable use rules for Sanctum Runtime, Connect Agent, third-party AI model routing, autonomous actions, and high-impact AI deployments.";

export const Route = createFileRoute("/acceptable-use")({
  component: AcceptableUsePage,
  head: () => pageSeo({ title, description, path }),
});

function AcceptableUsePage() {
  return (
    <DiscoverPageLayout
      eyebrow="Legal"
      title="Acceptable Use Policy"
      lead="Sanctum Runtime is built to control autonomous actions before they execute. This policy explains what you may not do with the hosted service, SDK, Connect Agent proxy, and related APIs."
    >
      <p className="text-sm text-muted-foreground">Last updated: June 1, 2026</p>

      <section>
        <h2>1. Your responsibility</h2>
        <p>
          You are responsible for the agents, tools, model providers, credentials, prompts, policies,
          workflows, and environments you connect to Sanctum. You must have permission to connect every
          account, API, device, robot, workflow, dataset, and model provider you use with the service.
        </p>
      </section>

      <section>
        <h2>2. Third-party AI providers</h2>
        <p>
          Sanctum can route requests to third-party AI platforms through Connect Agent or customer
          integrations. Sanctum is independent from those providers. You must comply with each
          provider&apos;s terms, safety rules, usage policies, rate limits, and applicable law.
        </p>
      </section>

      <section>
        <h2>3. Prohibited uses</h2>
        <p>You must not use Sanctum to build, route, authorize, monitor, or coordinate:</p>
        <ul>
          <li>Malware, credential theft, phishing, spam, fraud, or social engineering</li>
          <li>Unlawful surveillance, doxxing, stalking, or unauthorized biometric identification</li>
          <li>Unauthorized access to systems, accounts, devices, networks, homes, vehicles, or robots</li>
          <li>Actions intended to bypass model-provider safety systems, access controls, or rate limits</li>
          <li>Deceptive impersonation, undisclosed automated decisions, or misleading AI-generated content</li>
          <li>Weapons, physical harm, self-harm, or instructions that materially enable harm</li>
          <li>Illegal financial activity, sanctions evasion, money laundering, or unauthorized transfers</li>
          <li>High-impact decisions in employment, credit, housing, education, healthcare, insurance, or legal contexts without required authorization, review, safeguards, and compliance controls</li>
        </ul>
      </section>

      <section>
        <h2>4. High-impact and physical systems</h2>
        <p>
          If you use Sanctum with financial accounts, healthcare systems, industrial equipment, smart
          homes, physical security, vehicles, drones, robots, or other safety-critical systems, you must
          implement appropriate testing, logging, human oversight, emergency stops, least-privilege
          credentials, and rollback procedures.
        </p>
      </section>

      <section>
        <h2>5. Enforcement</h2>
        <p>
          We may suspend, limit, or terminate access if we believe use of Sanctum creates legal,
          security, safety, abuse, payment, or platform-policy risk. We may also preserve records and
          cooperate with lawful requests where required.
        </p>
      </section>

      <section>
        <h2>6. Contact</h2>
        <p>
          Questions or abuse reports:{" "}
          <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
            {supportEmail}
          </a>
        </p>
        <p>
          <Link to="/terms">Terms &amp; Conditions</Link> · <Link to="/privacy">Privacy Policy</Link>{" "}
          · <Link to="/refund">Refund Policy</Link> · <Link to="/contact">Contact</Link>
        </p>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd(path, title, description)) }}
      />
    </DiscoverPageLayout>
  );
}
