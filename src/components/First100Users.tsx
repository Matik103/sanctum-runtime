import { Link } from "@tanstack/react-router";
import { ArrowRight, MessageSquareText, Radar, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackCta } from "@/lib/analytics";
import { consoleUrl } from "@/lib/site-links";

const pilotSteps = [
  {
    icon: ShieldCheck,
    title: "Protect one real action",
    desc: "Pick the action your users fear most: send_email, transfer_funds, delete_record, deploy_production, unlock_door.",
  },
  {
    icon: Radar,
    title: "Show the live boundary",
    desc: "Run it through Connect Agent or the SDK so the operator sees the hold, policy reason, blast radius, and audit trail.",
  },
  {
    icon: MessageSquareText,
    title: "Invite the exact buyer",
    desc: "Target agent founders, platform engineers, MCP server teams, robotics integrators, and security leads with a five-minute pilot.",
  },
];

export function First100Users() {
  return (
    <section id="first-100" className="relative py-20 md:py-24 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-primary uppercase tracking-wider">First 100 users</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
              Sell the moment an agent asks for power
            </h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              The sharpest acquisition path is not a broad “AI security” pitch. It is a
              concrete runtime demo: an agent tries a risky tool call, Sanctum pauses it,
              the operator approves or blocks, and the executor only runs with proof.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
                <Link
                  to="/first-100-users/"
                  onClick={() =>
                    trackCta({ location: "first_100_home", cta: "open_playbook", destination: "first_100_users" })
                  }
                >
                  Get the playbook
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="glass">
                <a
                  href={consoleUrl}
                  onClick={() =>
                    trackCta({ location: "first_100_home", cta: "open_console", destination: "console" })
                  }
                >
                  Run a pilot
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
