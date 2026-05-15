import { Workflow, Bot, Factory, Plane, Home, Rocket } from "lucide-react";

const cases = [
  { icon: Workflow, title: "AI Agents", desc: "Verify emails, files, APIs, and workflows before they execute." },
  { icon: Bot, title: "Humanoids & Robotics", desc: "Authorize physical actions against signed policy — flagship path." },
  { icon: Factory, title: "Industrial Automation", desc: "Halt unsafe sequences before they reach the floor." },
  { icon: Plane, title: "Drones & Mobility", desc: "Geofenced commands and routing governance, offline-capable." },
  { icon: Home, title: "Smart Home AI", desc: "Locks, cameras, and automations with local intent verification." },
  { icon: Rocket, title: "Enterprise Automation", desc: "Governance, audit trails, and approval chains for AI workflows." },
];

export function UseCases() {
  return (
    <section id="use-cases" className="relative py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Use cases</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">One runtime, every autonomous system</h2>
        </div>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cases.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="group glass rounded-xl p-6 hover:border-primary/50 hover:bg-surface/80 transition-all">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-gradient-primary group-hover:text-primary-foreground transition-all">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
              </div>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
