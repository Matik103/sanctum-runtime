import { Check } from "lucide-react";

const code = `cp .env.example .env  # set SANCTUM_API_URL
npm run dev:runtime

import { SanctumRuntime } from "@sanctum-runtime/sdk";
import { protectAgent, AgentActions } from "@sanctum/adapter-agent-runtime";

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL,
});

await protectAgent(sanctum, {
  action: AgentActions.SEND_EMAIL,
  context: { to: "user@example.com" },
  offlineMode: true,
  execute: async () => sendEmail(),
});`;

const features = [
  "Verify before execute — middleware or protectAgent()",
  "Policies: approve, verify, or block per action",
  "Local Ollama risk + offline heuristics (OSS)",
  "Audit log + community dashboard",
];

export function SdkSection() {
  return (
    <section id="sdk" className="relative py-24 md:py-32 bg-gradient-surface">
      <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Developer SDK</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight">
            Four lines between your model and the real world.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            Sanctum sits between your agent and execution — verify, govern, and audit
            every action without rewriting your stack.
          </p>
          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-foreground/90">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 bg-gradient-primary opacity-20 blur-2xl rounded-3xl" />
          <div className="relative glass rounded-2xl overflow-hidden shadow-elevated">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/80">
              <span className="h-3 w-3 rounded-full bg-destructive/70" />
              <span className="h-3 w-3 rounded-full bg-warning/70" />
              <span className="h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">runtime.ts</span>
            </div>
            <pre className="p-6 text-sm font-mono leading-relaxed overflow-x-auto">
              <code className="text-foreground/90" style={{ fontFamily: 'var(--font-mono)' }}>
                {code}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
