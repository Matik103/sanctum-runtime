import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { consoleUrl, enterpriseAccessUrl, quickstartPath } from "@/lib/site-links";
import { ArrowRight, BookOpen, ShieldCheck } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-24 md:pt-44 md:pb-36">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0 bg-gradient-glow" />
      <div className="absolute -top-20 left-1/2 h-[500px] w-[800px] -translate-x-1/2 bg-gradient-primary opacity-20 blur-[120px] rounded-full" />

      <div className="container relative mx-auto px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Open-core runtime · MIT · v0.1 preview
          </div>

          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight">
            Runtime trust infrastructure for{" "}
            <span className="text-gradient">autonomous systems</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            Sanctum sits between AI reasoning and real-world execution — permissions,
            verification, audit logs, and local governance for agents, robotics, and
            automation.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90 h-12 px-6">
              <a href={consoleUrl}>
                Start with Runtime
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline" className="glass h-12 px-6 hover:bg-surface">
              <Link to={quickstartPath}>
                <BookOpen className="mr-2 h-4 w-4" />
                Quick Start
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="h-12 px-4 text-muted-foreground hover:text-foreground">
              <a href={enterpriseAccessUrl}>Enterprise</a>
            </Button>
          </div>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-muted-foreground">
            <span>AI agents · ROS2 · Ollama · edge</span>
            <span className="hidden sm:inline">·</span>
            <span>Local-first · Offline capable</span>
            <span className="hidden sm:inline">·</span>
            <span>Basic audit logs (OSS)</span>
          </div>
        </div>
      </div>
    </section>
  );
}
