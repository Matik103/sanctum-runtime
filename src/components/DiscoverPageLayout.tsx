import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CtaFooter } from "@/components/CtaFooter";
import { docsPath } from "@/lib/site-links";

type DiscoverPageLayoutProps = {
  title: string;
  eyebrow?: string;
  lead: string;
  children: React.ReactNode;
};

export function DiscoverPageLayout({ title, eyebrow, lead, children }: DiscoverPageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-24">
        <article className="container mx-auto px-6 max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          {eyebrow ? (
            <p className="text-sm font-medium text-primary uppercase tracking-wider">{eyebrow}</p>
          ) : null}
          <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-foreground">{title}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{lead}</p>
          <div className="mt-10 space-y-8 text-muted-foreground leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-3 [&_h3]:text-foreground [&_h3]:font-medium [&_h3]:mt-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_a]:text-primary [&_a]:hover:underline">
            {children}
          </div>
          <p className="mt-12 text-sm text-muted-foreground">
            Full reference:{" "}
            <Link to={docsPath} className="text-primary hover:underline">
              documentation
            </Link>
            {" · "}
            <a href="/llms.txt" className="text-primary hover:underline">
              llms.txt
            </a>
            {" · "}
            <a href="/llms-full.txt" className="text-primary hover:underline">
              llms-full.txt
            </a>
            {" · "}
            <a href="/ai/architecture.md" className="text-primary hover:underline">
              architecture.md
            </a>
          </p>
        </article>
      </main>
      <CtaFooter />
    </div>
  );
}
