import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  consoleUrl,
  contactUrl,
  docsPath,
  llmsTxtUrl,
  llmsFullTxtUrl,
  privacyUrl,
  refundUrl,
  termsUrl,
} from "@/lib/site-links";
import logo from "@/assets/sanctum-logo.png";

function isExternal(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

function splitHash(path: string): { pathname: string; hash?: string } {
  const i = path.indexOf("#");
  if (i === -1) return { pathname: path };
  return { pathname: path.slice(0, i) || "/", hash: path.slice(i + 1) };
}

function FooterNavLink({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  const className =
    "relative z-10 hover:text-foreground underline-offset-4 hover:underline transition-colors";

  if (external || isExternal(href)) {
    return (
      <a
        href={href}
        className={className}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }

  const { pathname, hash } = splitHash(href);
  return (
    <Link to={pathname} hash={hash} className={className}>
      {children}
    </Link>
  );
}

/** Shared site footer — Paddle verification links + product entry. */
export function SiteFooter() {
  return (
    <footer className="relative z-20 border-t border-border bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="Sanctum" className="h-6 w-6" />
            <span className="font-display font-semibold text-foreground">Sanctum</span>
            <span className="hidden sm:inline ml-1">— Runtime trust for autonomous AI</span>
          </div>
          <nav
            className="flex flex-wrap items-center justify-center md:justify-end gap-x-5 gap-y-2"
            aria-label="Footer"
          >
            <FooterNavLink href={privacyUrl}>Privacy Policy</FooterNavLink>
            <FooterNavLink href={termsUrl}>Terms &amp; Conditions</FooterNavLink>
            <FooterNavLink href={refundUrl}>Refund Policy</FooterNavLink>
            <FooterNavLink href="/blog">Blog</FooterNavLink>
            <FooterNavLink href={docsPath}>Documentation</FooterNavLink>
            <FooterNavLink href={llmsTxtUrl}>llms.txt</FooterNavLink>
            <FooterNavLink href={llmsFullTxtUrl}>llms-full.txt</FooterNavLink>
            <FooterNavLink href={contactUrl}>Contact</FooterNavLink>
            <FooterNavLink href={consoleUrl} external>
              Console
            </FooterNavLink>
            <span className="text-muted-foreground/80">© 2026</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
