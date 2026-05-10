import { Cloud, Wifi, AlertTriangle, KeyRound, Eye } from "lucide-react";

const issues = [
  { icon: Cloud, title: "Cloud dependence", desc: "Robots that can't think without a server can't be trusted in the field." },
  { icon: Wifi, title: "Remote hijacking", desc: "Open APIs and unverified prompts give attackers a direct line to motors." },
  { icon: AlertTriangle, title: "Unsafe actions", desc: "Models hallucinate. In a physical world, hallucinations break things — or people." },
  { icon: KeyRound, title: "Prompt injection", desc: "A single poisoned input can override safety constraints across an entire fleet." },
  { icon: Eye, title: "Privacy exposure", desc: "Sensors stream private data to third-party clouds with no enforced boundary." },
];

export function Problem() {
  return (
    <section id="problem" className="relative py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">The problem</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
            AI can think. <span className="text-muted-foreground">But can you trust it?</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {issues.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-xl p-6 hover:border-primary/40 transition-colors">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
