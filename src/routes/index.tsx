import { createFileRoute } from "@tanstack/react-router";
import { homepageFaqJsonLd, pageSeo, siteName, defaultDescription } from "@/lib/seo";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Problem } from "@/components/Problem";
import { Solution } from "@/components/Solution";
import { Architecture } from "@/components/Architecture";
import { SdkSection } from "@/components/SdkSection";
import { QuickStartStrip } from "@/components/QuickStartStrip";
import { PersonaPaths } from "@/components/PersonaPaths";
import { UseCases } from "@/components/UseCases";
import { PilotSection } from "@/components/PilotSection";
import { Trust } from "@/components/Trust";
import { FaqSection } from "@/components/FaqSection";
import { CtaFooter } from "@/components/CtaFooter";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    ...pageSeo({
      title: `${siteName} — Runtime Trust for Autonomous AI`,
      description: defaultDescription,
      path: "/",
    }),
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(homepageFaqJsonLd),
      },
    ],
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
        <QuickStartStrip />
        <PilotSection />
        <PersonaPaths />
        <Architecture />
        <SdkSection />
        <UseCases />
        <Trust />
        <FaqSection />
        <CtaFooter />
      </main>
    </div>
  );
}
