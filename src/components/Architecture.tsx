import { Fragment } from "react";
import { User, Brain, ShieldCheck, Bot } from "lucide-react";

const nodes = [
  { icon: User, label: "Operator", desc: "Human intent" },
  { icon: Brain, label: "AI Model", desc: "Local or cloud LLM" },
  { icon: ShieldCheck, label: "Sanctum Runtime", desc: "Verify · Authorize · Audit", highlight: true },
  { icon: Bot, label: "Physical Action", desc: "Motors · Sensors · Effectors" },
];

export function Architecture() {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Architecture</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">A trust layer between thought and motion</h2>
        </div>

        <div className="mt-16 glass rounded-3xl p-8 md:p-12 relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-30" />
          <div className="relative grid grid-cols-1 md:grid-cols-7 items-center gap-6 md:gap-2">
            {nodes.map((node, i) => (
              <Fragment key={node.label}>
                <div
                  className={`md:col-span-1 flex flex-col items-center text-center ${
                    node.highlight ? "md:scale-110" : ""
                  }`}
                >
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl ${
                      node.highlight
                        ? "bg-gradient-primary shadow-glow animate-pulse-glow"
                        : "bg-surface border border-border"
                    }`}
                  >
                    <node.icon className={`h-7 w-7 ${node.highlight ? "text-primary-foreground" : "text-foreground"}`} />
                  </div>
                  <p className={`mt-3 text-sm font-semibold ${node.highlight ? "text-primary" : ""}`}>{node.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{node.desc}</p>
                </div>
                {i < nodes.length - 1 && (
                  <div className="md:col-span-1 flex justify-center">
                    <div className="hidden md:block h-px w-full bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
                    <div className="md:hidden h-8 w-px bg-gradient-to-b from-primary/20 via-primary to-primary/20" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
