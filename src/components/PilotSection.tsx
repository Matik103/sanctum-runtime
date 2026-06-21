import { Link } from "@tanstack/react-router";
import { ArrowRight, KeyRound, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCta } from "@/lib/analytics";
import { consoleUrl } from "@/lib/site-links";

const pilotSteps = [
  {
    icon: ShieldCheck,
    title: "Choose one action to protect",
    desc: "Start with the tool call your team cannot afford to let run unchecked: email, money movement, production writes, secrets, or physical access.",
  },
  {
    icon: Radar,
    title: "Route it through Sanctum",
    desc: "Use Connect Agent for the fastest proxy path, or the SDK/adapters when you want deeper control inside your runtime.",
  },
  {
    icon: KeyRound,
    title: "Execute only with proof",
    desc: "Sanctum records the decision, shows the approval context, and can issue a signed action token before the executor runs.",
  },
];

export function PilotSection() {
  return (
    <section id="pilot" className="relative py-20 md:py-24 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-primary uppercase tracking-wider">Pilot path</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
              Prove agent safety with one real action
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              Pick a high-impact tool call, run it through Sanctum, and show the
              exact moment the system verifies, holds, blocks, or approves execution.
              It is the fastest way to move from “we have guardrails” to enforceable
              runtime control.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                <Link
                  to="/pilot"
                  onClick={() =>
                    trackCta({ location: "pilot_home", cta: "open_pilot_guide", destination: "pilot" })
                  }
                >
                  View pilot guide
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="glass">
                <a
                  href={consoleUrl}
                  onClick={() =>
                    trackCta({ location: "pilot_home", cta: "open_console", destination: "console" })
                  }
                >
                  Open console
                </a>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            {pilotSteps.map(({ icon: Icon, title, desc }) => (
              <article key={title} className="glass rounded-xl border border-border p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
