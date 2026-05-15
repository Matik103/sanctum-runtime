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
      { title: "Sanctum — Runtime Trust for Autonomous AI" },
      {
        name: "description",
        content:
          "Runtime trust infrastructure for autonomous AI systems — action verification, permissions, audit logs, and local governance.",
      },
      { property: "og:title", content: "Sanctum — Runtime Trust for Autonomous AI" },
      {
        property: "og:description",
        content:
          "Sanctum provides runtime trust infrastructure between AI reasoning and real-world execution.",
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
