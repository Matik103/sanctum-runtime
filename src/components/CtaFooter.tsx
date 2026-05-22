import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { consoleUrl, enterpriseAccessUrl } from "@/lib/site-links";
import { ArrowRight } from "lucide-react";

const enterpriseIsInternal = !enterpriseAccessUrl.startsWith("http");

export function CtaFooter() {
  return (
    <>
      <section className="relative py-24 md:py-36 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-glow" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-primary opacity-20 blur-[120px]"
          aria-hidden
        />

        <div className="container relative z-10 mx-auto px-6 text-center">
          <h2 className="font-display text-5xl md:text-6xl font-semibold leading-tight">
            Build AI humans <br className="hidden md:block" />
            can <span className="text-gradient">trust</span>.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            Open the cloud console to manage runtimes and policies, or self-host the open-source
            runtime from GitHub.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 h-12 px-8"
            >
              <a href={consoleUrl}>
                Start with Runtime
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            {enterpriseIsInternal ? (
              <Button asChild size="lg" variant="outline" className="glass h-12 px-8">
                <Link to={enterpriseAccessUrl}>Enterprise</Link>
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="glass h-12 px-8">
                <a href={enterpriseAccessUrl}>Enterprise</a>
              </Button>
            )}
          </div>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
