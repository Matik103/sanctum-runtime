import { createFileRoute } from "@tanstack/react-router";
import { pageSeo, siteName, defaultDescription } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Solution } from "@/components/Solution";
import { Architecture } from "@/components/Architecture";
import { SdkSection } from "@/components/SdkSection";
import { UseCases } from "@/components/UseCases";
import { Trust } from "@/components/Trust";
import { CtaFooter } from "@/components/CtaFooter";

export const Route = createFileRoute("/")({
  component: Index,
  head: () =>
    pageSeo({
      title: `${siteName} — Runtime Trust for Autonomous AI`,
      description: defaultDescription,
      path: "/",
    }),
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Solution />
        <Architecture />
        <SdkSection />
        <UseCases />
        <Trust />
        <CtaFooter />
      </main>
    </div>
  );
}
