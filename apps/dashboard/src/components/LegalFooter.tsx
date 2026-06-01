import {
  acceptableUseUrl,
  contactUrl,
  docsUrl,
  pricingUrl,
  privacyUrl,
  refundUrl,
  termsUrl,
} from '../lib/site-links'

const links = [
  { href: privacyUrl, label: 'Privacy Policy' },
  { href: termsUrl, label: 'Terms & Conditions' },
  { href: refundUrl, label: 'Refund Policy' },
  { href: acceptableUseUrl, label: 'Acceptable Use' },
  { href: docsUrl, label: 'Documentation' },
  { href: pricingUrl, label: 'Pricing' },
  { href: contactUrl, label: 'Contact' },
] as const

/** Payment verification footer — links to public marketing legal pages. */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`legal-footer ${className}`.trim()} aria-label="Legal and support">
      <nav className="legal-footer__nav">
        {links.map(({ href, label }, i) => (
          <span key={href} className="legal-footer__item">
            {i > 0 && <span className="legal-footer__sep" aria-hidden>·</span>}
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          </span>
        ))}
      </nav>
    </footer>
  )
}
