import { ShieldCheck, Cpu, Activity } from "lucide-react";

const pillars = [
  {
    icon: ShieldCheck,
    title: "Action Firewall",
    desc: "Every high-stakes action is intercepted, evaluated against policy, and approved, verified, or blocked — before execution.",
  },
  {
    icon: Cpu,
    title: "Local Cognition",
    desc: "Run inference and policy locally with Ollama, llama.cpp, or your own models. Sovereign by default. Cloud-optional.",
  },
  {
    icon: Activity,
    title: "Behavioral Monitoring",
    desc: "Detect anomalous prompt chains, escalation attempts, and suspicious remote inputs in real time across your fleet.",
  },
];

export function Solution() {
  return (
    <section id="solution" className="relative py-24 md:py-32 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">The solution</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
            The runtime layer for <span className="text-gradient">trusted autonomy</span>
          </h2>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {pillars.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group relative glass rounded-2xl p-8 hover:shadow-glow transition-all duration-300">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-semibold">{title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
