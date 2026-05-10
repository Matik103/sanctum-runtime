import { createFileRoute } from "@tanstack/react-router";
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
  head: () => ({
    meta: [
      { title: "Sanctum — Trusted Runtime for Physical AI" },
      {
        name: "description",
        content:
          "Sanctum secures humanoids, robots, and AI agents with local-first runtime protection, behavioral monitoring, and action authorization.",
      },
      { property: "og:title", content: "Sanctum — Trusted Runtime for Physical AI" },
      {
        property: "og:description",
        content: "Local-first runtime protection, behavioral monitoring, and action authorization for embodied intelligence.",
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
        <Architecture />
        <SdkSection />
        <UseCases />
        <Trust />
        <CtaFooter />
      </main>
    </div>
  );
}
