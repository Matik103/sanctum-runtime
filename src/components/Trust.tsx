const metrics = [
  { value: "12.4M", label: "Actions Verified", sub: "across pilot fleets" },
  { value: "8,217", label: "Threats Blocked", sub: "last 30 days" },
  { value: "99.99%", label: "Offline Integrity", sub: "no cloud required" },
  { value: "<3ms", label: "Runtime Latency", sub: "p99 on edge devices" },
];

export function Trust() {
  return (
    <section id="trust" className="relative py-24 md:py-32 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Trust by the numbers</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
            Infrastructure-grade <span className="text-gradient">accountability</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="glass rounded-2xl p-8 text-center hover:shadow-glow transition-shadow">
              <div className="font-display text-4xl md:text-5xl font-semibold text-gradient">{m.value}</div>
              <div className="mt-3 text-sm font-medium">{m.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
