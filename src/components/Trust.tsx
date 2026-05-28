const proofs = [
  {
    title: "Deterministic action outcomes",
    sub: "Approve, verify, or block before side effects execute.",
  },
  {
    title: "Replayable policy history",
    sub: "Versioned rules and decision trails for incident review.",
  },
  {
    title: "Human verification workflow",
    sub: "Queue, approve, deny, and escalate with mobile and web review.",
  },
  {
    title: "Offline-capable control",
    sub: "Policy checks can run locally for edge and sovereign deployments.",
  },
];

export function Trust() {
  return (
    <section id="trust" className="relative py-24 md:py-32 bg-gradient-surface">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-primary uppercase tracking-wider">Trust architecture</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold">
            Infrastructure-grade <span className="text-gradient">accountability</span>
          </h2>
        </div>

        <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {proofs.map((p) => (
            <div key={p.title} className="glass rounded-2xl p-8 text-center hover:shadow-glow transition-shadow">
              <div className="text-sm font-semibold text-foreground">{p.title}</div>
              <div className="mt-2 text-xs text-muted-foreground">{p.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
