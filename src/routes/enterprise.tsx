import { createFileRoute, Link } from '@tanstack/react-router'
import { DiscoverPageLayout } from '@/components/DiscoverPageLayout'
import { pageSeo } from '@/lib/seo'
import { billingEmail, consoleUrl, contactUrl, privacyEmail } from '@/lib/site-links'

const path = '/enterprise'
const title = 'Enterprise — Sanctum Runtime'
const description =
  'Fleet orchestration, SSO, RBAC, compliance exports, and dedicated support for organizations running Sanctum Runtime at scale.'

export const Route = createFileRoute('/enterprise')({
  component: EnterprisePage,
  head: () => pageSeo({ title, description, path }),
})

function EnterprisePage() {
  return (
    <DiscoverPageLayout
      eyebrow="Enterprise"
      title="Fleet trust infrastructure at scale"
      lead="Run Sanctum across agents, robotics, and automation with org-wide policies, enterprise SSO, audit exports, and operator governance — without giving up local-first execution."
    >
      <section>
        <h2>What enterprise includes</h2>
        <ul>
          <li>Organization SSO (Google, GitHub) and domain-based org provisioning</li>
          <li>Runtime fleet map, multi-runtime policies, and kill switch</li>
          <li>Governance workflows, dual approver, and compliance evidence exports</li>
          <li>Billing, usage metering, and marketplace policy packs</li>
          <li>Mobile PWA companion for verification on the go</li>
        </ul>
      </section>
      <section>
        <h2>Open core + hosted control plane</h2>
        <p>
          The MIT runtime and SDK stay open. Enterprise features run on the hosted API and console — deploy agents
          locally or on your cloud, supervise from{' '}
          <a href={consoleUrl} className="text-primary hover:underline">
            console.sanctumruntime.com
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Talk to us</h2>
        <p>
          Fleet pilots, security reviews, and procurement: use the{' '}
          <Link to={contactUrl} className="text-primary hover:underline">
            contact page
          </Link>
          {' '}or email{' '}
          <a href={`mailto:${billingEmail}`} className="text-primary hover:underline">
            {billingEmail}
          </a>
          . Privacy requests:{' '}
          <a href={`mailto:${privacyEmail}`} className="text-primary hover:underline">
            {privacyEmail}
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Self-serve start</h2>
        <p>
          Create an organization in the console, invite operators, and connect your first runtime — or{' '}
          <Link to="/docs/" hash="quickstart" className="text-primary hover:underline">
            self-host from GitHub
          </Link>{' '}
          first.
        </p>
      </section>
    </DiscoverPageLayout>
  )
}
