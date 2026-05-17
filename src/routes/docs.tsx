import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { consoleUrl, githubUrl } from "@/lib/site-links";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/docs")({
  component: DocsPage,
  head: () => ({
    meta: [
      { title: "Documentation — Sanctum Runtime" },
      {
        name: "description",
        content:
          "Sanctum Runtime documentation: runtime trust infrastructure for autonomous AI systems.",
      },
      { property: "og:title", content: "Documentation — Sanctum Runtime" },
      {
        property: "og:description",
        content:
          "Action verification, permissions, audit logs, and local governance for agents, robotics, and automation.",
      },
    ],
  }),
});

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-12 border-t border-border first:border-t-0 first:pt-0">
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-wider text-primary mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-6">
        {title}
      </h2>
      <div className="prose-docs space-y-4 text-foreground/80 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-xl md:text-2xl font-semibold text-foreground mt-8 mb-3">
      {children}
    </h3>
  );
}

function H4({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="font-display text-base font-semibold text-foreground mt-6 mb-2 uppercase tracking-wider">
      {children}
    </h4>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-primary pl-4 italic text-foreground/90 my-6">
      {children}
    </blockquote>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-6 space-y-1.5 text-foreground/80 marker:text-primary">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function Code({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="my-5 glass rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface/80">
        <span className="text-xs font-mono text-muted-foreground">{lang}</span>
      </div>
      <pre className="p-4 text-sm font-mono leading-relaxed overflow-x-auto">
        <code className="text-foreground/90" style={{ fontFamily: "var(--font-mono)" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}

const toc = [
  { id: "introduction", label: "Introduction" },
  { id: "why", label: "Why Sanctum Exists" },
  { id: "what", label: "What Sanctum Is" },
  { id: "focus", label: "Starting Focus" },
  { id: "problem", label: "The Problem" },
  { id: "runtime", label: "The Sanctum Runtime" },
  { id: "components", label: "Core Components" },
  { id: "local-first", label: "Why Local-First" },
  { id: "use-cases", label: "Use Cases" },
  { id: "architecture", label: "Architecture Philosophy" },
  { id: "stack", label: "Technology Stack" },
  { id: "access", label: "Developer Access" },
  { id: "quickstart", label: "Quick Start" },
  { id: "open-core", label: "Open Source" },
  { id: "philosophy", label: "Runtime Philosophy" },
  { id: "long-term", label: "Long-Term Direction" },
  { id: "phase", label: "Current Phase" },
  { id: "final", label: "Final Principle" },
];

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-24">
        <div className="container mx-auto px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>

          <div className="grid lg:grid-cols-[240px_1fr] gap-12">
            {/* Sidebar TOC */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
                  On this page
                </p>
                <nav className="space-y-1.5 text-sm">
                  {toc.map((t) => (
                    <a
                      key={t.id}
                      href={`#${t.id}`}
                      className="block text-muted-foreground hover:text-primary transition-colors"
                    >
                      {t.label}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content */}
            <article className="max-w-3xl">
              <header className="mb-12">
                <p className="text-sm font-medium text-primary uppercase tracking-wider mb-3">
                  Sanctum Runtime
                </p>
                <h1 className="font-display text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
                  Runtime trust infrastructure for{" "}
                  <span className="text-gradient">autonomous AI</span>
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                  Sanctum provides runtime trust between AI reasoning and real-world
                  execution — for agents, robotics, automation, and embodied systems.
                </p>
                <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 text-sm text-foreground/90">
                  <strong className="text-foreground">v0.1 — open source (MIT).</strong>{" "}
                  <a
                    href={githubUrl}
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    GitHub (self-host)
                  </a>
                  {" "}— copy <code className="font-mono text-primary">.env.example</code> to{" "}
                  <code className="font-mono text-primary">.env</code>, then{" "}
                  <code className="font-mono text-primary">npm run dev:runtime</code>. Hosted console:{" "}
                  <a href={consoleUrl} className="text-primary hover:underline">
                    console.sanctumruntime.com
                  </a>
                  . Enterprise boundary:{" "}
                  <a href="#open-core" className="text-primary hover:underline">
                    open core
                  </a>
                  .
                </div>
              </header>

              <Section id="introduction" title="Introduction">
                <p>Artificial intelligence is beginning to move beyond screens.</p>
                <p>
                  The next generation of AI will not simply answer questions or generate
                  content. It will:
                </p>
                <List
                  items={[
                    "move through homes",
                    "operate machinery",
                    "interact with families",
                    "access physical environments",
                    "assist workers",
                    "make decisions in real time",
                    "and increasingly influence the physical world",
                  ]}
                />
                <p>As AI becomes embodied, cybersecurity becomes physical security.</p>
                <p>This changes everything.</p>
                <p>
                  The current AI ecosystem was largely built around cloud-first
                  architectures designed for software assistants and web-based models. But
                  physical AI introduces a different class of risk:
                </p>
                <List
                  items={[
                    "unauthorized actions",
                    "unsafe autonomy",
                    "prompt injection",
                    "remote manipulation",
                    "cloud dependency",
                    "privacy exposure",
                    "and unverified real-world execution",
                  ]}
                />
                <p>Sanctum exists to solve this problem.</p>
                <p>We are building runtime trust infrastructure for autonomous AI systems.</p>
              </Section>

              <Section id="why" title="Why Sanctum Exists">
                <p>Most AI infrastructure today focuses on:</p>
                <List
                  items={[
                    "intelligence",
                    "reasoning",
                    "model performance",
                    "generation quality",
                    "and scalability",
                  ]}
                />
                <p>Very few systems focus on trust architecture.</p>
                <p>Yet the moment AI gains the ability to:</p>
                <List
                  items={[
                    "unlock a door",
                    "move through a building",
                    "operate equipment",
                    "interact with vulnerable individuals",
                    "access sensitive systems",
                    "or make physical decisions",
                  ]}
                />
                <p>trust becomes the most important layer in the stack.</p>
                <p>Sanctum was created around a simple principle:</p>
                <Quote>Powerful AI systems require trustworthy runtime infrastructure.</Quote>
                <p>Not fear. Not restriction. Not anti-AI narratives. Trust.</p>
              </Section>

              <Section id="what" title="What Sanctum Is">
                <p>
                  Sanctum is a local-first runtime trust layer for autonomous AI systems —
                  agents, robotics, automation, and embodied platforms.
                </p>
                <p>It acts as a secure control layer between:</p>
                <List
                  items={[
                    "AI models",
                    "physical devices",
                    "users",
                    "cloud services",
                    "and real-world actions",
                  ]}
                />
                <p>Sanctum is designed to help developers build AI systems that are:</p>
                <List
                  items={[
                    "observable",
                    "permission-aware",
                    "auditable",
                    "resilient",
                    "and safer to deploy",
                  ]}
                />
              </Section>

              <Section
                id="focus"
                eyebrow="Phase 1"
                title="AI Behavioral Firewall + Action Permission SDK"
              >
                <p>
                  Rather than attempting to solve every problem in synthetic infrastructure
                  immediately, Sanctum begins with a focused and practical foundation:
                </p>
                <List
                  items={[
                    "behavioral monitoring",
                    "action verification",
                    "runtime observability",
                    "local-first protection",
                    "and offline-capable execution",
                  ]}
                />
                <p>This allows developers and companies to:</p>
                <List
                  items={[
                    "create real deployments",
                    "build safer agent deployments",
                    "establish trust with users",
                    "reduce operational risk",
                    "and prepare for the next generation of robotics systems",
                  ]}
                />
                <p>This first phase is intentionally designed to:</p>
                <List
                  items={[
                    "accelerate developer adoption",
                    "support enterprise security requirements",
                    "enable robotics integrations",
                    "and establish the foundation for long-term synthetic infrastructure",
                  ]}
                />
              </Section>

              <Section id="problem" title="The Problem">
                <H3>AI Can Think. But Can You Trust It?</H3>
                <p>Modern AI systems can already:</p>
                <List
                  items={[
                    "access APIs",
                    "write code",
                    "browse the web",
                    "operate applications",
                    "control devices",
                    "and chain actions autonomously",
                  ]}
                />
                <p>
                  As these systems become connected to robotics platforms, humanoids,
                  drones, industrial systems, and smart environments, new categories of
                  risk emerge.
                </p>

                <H3>Cloud Dependence</H3>
                <p>Many AI systems rely heavily on remote infrastructure.</p>
                <p>This creates:</p>
                <List
                  items={[
                    "availability risks",
                    "latency concerns",
                    "privacy exposure",
                    "and centralized points of failure",
                  ]}
                />
                <p>
                  In physical environments, unstable connectivity should never compromise
                  safety.
                </p>

                <H3>Prompt Injection and Behavioral Manipulation</H3>
                <p>AI systems can be manipulated through:</p>
                <List
                  items={[
                    "indirect instructions",
                    "malicious prompts",
                    "hostile external inputs",
                    "or unsafe command chaining",
                  ]}
                />
                <p>
                  Without runtime verification, AI may execute actions outside expected
                  behavioral boundaries.
                </p>

                <H3>Unsafe Physical Actions</H3>
                <p>Physical AI introduces real-world consequences.</p>
                <p>An AI system should not automatically:</p>
                <List
                  items={[
                    "unlock secured areas",
                    "control machinery",
                    "access sensitive infrastructure",
                    "initiate payments",
                    "or interact with vulnerable individuals without context-aware authorization",
                  ]}
                />

                <H3>Lack of Observability</H3>
                <p>Most AI systems today lack sufficient runtime transparency.</p>
                <p>Developers and enterprises need:</p>
                <List
                  items={[
                    "audit trails",
                    "execution visibility",
                    "approval flows",
                    "behavioral logs",
                    "and runtime verification",
                  ]}
                />
                <p>Without observability, trust becomes difficult to establish.</p>
              </Section>

              <Section id="runtime" title="The Sanctum Runtime">
                <p>
                  Sanctum Runtime is the operational trust layer that sits between AI
                  reasoning and physical execution.
                </p>
                <p>It intercepts actions before execution and evaluates:</p>
                <List
                  items={[
                    "permissions",
                    "behavioral anomalies",
                    "execution context",
                    "policy rules",
                    "offline state",
                    "and risk conditions",
                  ]}
                />
                <p>The result is a safer and more controllable AI runtime environment.</p>
              </Section>

              <Section id="components" title="Core Runtime Components">
                <H3>Action Verification</H3>
                <p>
                  Before an AI system performs a sensitive action, Sanctum evaluates
                  whether the action should proceed.
                </p>
                <H4>Example</H4>
                <p>AI request:</p>
                <Quote>Unlock front door.</Quote>
                <p>Sanctum evaluates:</p>
                <List
                  items={[
                    "permission level",
                    "requesting identity",
                    "execution context",
                    "device trust state",
                    "anomaly score",
                    "and local policy",
                  ]}
                />
                <p>The action is then approved, denied, escalated, or held for verification.</p>

                <H3>Behavioral Monitoring</H3>
                <p>Sanctum continuously evaluates runtime behavior patterns.</p>
                <p>The platform can detect:</p>
                <List
                  items={[
                    "unusual command sequences",
                    "unsafe escalation patterns",
                    "suspicious remote instructions",
                    "prompt injection attempts",
                    "policy violations",
                    "and anomalous execution behavior",
                  ]}
                />
                <p>The goal is not to block intelligence. The goal is to establish trusted autonomy.</p>

                <H3>Offline Runtime Protection</H3>
                <p>Sanctum is designed with local-first principles.</p>
                <p>
                  AI systems should continue operating safely even when disconnected from
                  cloud infrastructure.
                </p>
                <p>Sanctum supports:</p>
                <List
                  items={[
                    "local execution",
                    "offline verification",
                    "local policy enforcement",
                    "local audit storage",
                    "and disconnected fallback modes",
                  ]}
                />
                <p>This architecture improves resilience, latency, reliability, and privacy.</p>

                <H3>Audit Logs</H3>
                <p>Every significant runtime event can be logged and verified.</p>
                <p>Audit trails may include:</p>
                <List
                  items={[
                    "action requests",
                    "execution decisions",
                    "policy evaluations",
                    "model confidence",
                    "approval states",
                    "runtime anomalies",
                    "and execution timestamps",
                  ]}
                />
                <p>For enterprise deployments, observability is essential.</p>
              </Section>

              <Section id="local-first" title="Why Local-First Matters">
                <p>
                  As AI systems become more integrated into daily life, users will
                  increasingly expect:
                </p>
                <List
                  items={[
                    "private interactions",
                    "secure execution",
                    "predictable behavior",
                    "and control over sensitive data",
                  ]}
                />
                <p>Local-first architecture helps reduce:</p>
                <List
                  items={[
                    "external dependency",
                    "unnecessary data transmission",
                    "exposure to cloud compromise",
                    "and centralized control risks",
                  ]}
                />
                <p>Not every AI decision should require remote infrastructure.</p>
                <p>Especially when physical systems are involved.</p>
              </Section>

              <Section id="use-cases" title="Example Use Cases">
                <H3>Humanoids</H3>
                <p>Future humanoids may:</p>
                <List
                  items={[
                    "assist families",
                    "support healthcare environments",
                    "operate in warehouses",
                    "or interact with children and elderly individuals",
                  ]}
                />
                <p>These systems require permission boundaries, trusted runtime monitoring, and transparent execution behavior.</p>

                <H3>AI Assistants</H3>
                <p>Advanced AI assistants increasingly interact with:</p>
                <List items={["APIs", "calendars", "communications", "finances", "and connected devices"]} />
                <p>Sanctum helps enforce runtime safety policies before sensitive actions occur.</p>

                <H3>Industrial Robotics</H3>
                <p>Industrial systems require low latency, local reliability, and operational resilience.</p>
                <p>Sanctum enables policy-aware runtime verification while maintaining local execution capability.</p>

                <H3>Smart Environments</H3>
                <p>Connected homes and facilities contain access systems, sensors, automation layers, and operational infrastructure.</p>
                <p>Sanctum helps establish trusted AI interaction boundaries across physical environments.</p>

                <H3>Autonomous Systems</H3>
                <p>Drones, mobile robots, and autonomous systems require execution validation, behavioral observability, and runtime resilience.</p>
                <p>These systems cannot rely entirely on uninterrupted cloud communication.</p>
              </Section>

              <Section id="architecture" title="Architecture Philosophy">
                <p>Sanctum is designed around several foundational principles.</p>
                <H3>Local-First</H3>
                <p>Sensitive runtime logic should remain operational even without cloud connectivity.</p>
                <H3>Permission-Aware Execution</H3>
                <p>Physical actions should require explicit policy validation.</p>
                <H3>Observable Runtime Behavior</H3>
                <p>Trust requires visibility.</p>
                <p>Developers and enterprises should understand what happened, why it happened, and how decisions were evaluated.</p>
                <H3>Interoperability</H3>
                <p>Sanctum is being designed to support robotics systems, AI agents, local inference platforms, edge devices, and future embodied systems.</p>
                <H3>Human-Aligned Infrastructure</H3>
                <p>The objective is not to limit AI capability. The objective is to help AI systems operate within trustworthy and understandable boundaries.</p>
              </Section>

              <Section id="stack" title="Technology Stack">
                <p>Sanctum is intentionally designed with practical, scalable, and developer-friendly infrastructure.</p>

                <H3>Frontend</H3>
                <H4>Marketing Platform</H4>
                <List items={["Next.js", "TailwindCSS", "Framer Motion", "shadcn/ui"]} />
                <H4>Dashboard</H4>
                <List items={["Next.js App Router", "TypeScript", "Zustand", "TanStack Query"]} />
                <p>Dashboard capabilities include runtime sessions, anomaly logs, action approvals, trust monitoring, offline state visibility, and permission management.</p>

                <H3>Backend</H3>
                <H4>Core Infrastructure</H4>
                <List items={["Node.js", "TypeScript", "Fastify"]} />
                <H4>Database</H4>
                <List items={["PostgreSQL", "Prisma ORM"]} />
                <H4>Realtime Layer</H4>
                <List items={["WebSockets", "NATS planned for future distributed runtime messaging"]} />

                <H3>AI Runtime Layer</H3>
                <p>Sanctum is designed around local inference compatibility.</p>
                <p>Supported local runtime directions include:</p>
                <List items={["Ollama", "llama.cpp", "DeepSeek local models", "and Qwen local models"]} />
                <p>This architecture prioritizes local execution, low latency, privacy, and runtime resilience.</p>

                <H3>Security Layer</H3>
                <p>Planned security directions include:</p>
                <List items={["JWT authentication", "device keys", "Rust-based runtime services", "and hardware trust integrations"]} />

                <H3>Robotics Compatibility</H3>
                <H4>Phase 1</H4>
                <List items={["Python SDK", "Node SDK"]} />
                <H4>Phase 2</H4>
                <List items={["ROS2 integration", "NVIDIA Jetson support", "Raspberry Pi support", "Unitree support"]} />
              </Section>

              <Section id="access" eyebrow="Architecture" title="How You Access Sanctum">
                <p>
                  Sanctum is infrastructure you <strong>install into systems</strong> — like Stripe,
                  Docker, or Supabase — not an app end users open.
                </p>

                <H3>A — Local SDK (Phase 1, primary)</H3>
                <p>
                  Runs <strong>inside</strong> your agent, backend, or robotics stack. This is the
                  core experience.
                </p>
                <Code lang="bash" code={`npm install @sanctum-runtime/sdk`} />

                <H3>B — Local runtime service (roadmap)</H3>
                <p>
                  Optional daemon on a device: intercepts actions, connects to Ollama, enforces
                  policies — think “Docker daemon for AI trust.”
                </p>
                <Code lang="bash" code={`npx sanctum init   # coming soon`} />

                <H3>C — Cloud dashboard (optional)</H3>
                <p>
                  Policy management, logs, and threat views. Visibility and control —{" "}
                  <strong>not</strong> the runtime itself.
                </p>

                <H3>Execution flow</H3>
                <List
                  items={[
                    "Before: AI → executes action directly",
                    "After: AI → Sanctum Runtime → Decision → Execution",
                  ]}
                />

                <H3>What Sanctum is not</H3>
                <List
                  items={[
                    "Not a chatbot or standalone consumer app",
                    "Not a robot controller",
                    "Not dashboard-first — the runtime is embedded middleware",
                  ]}
                />
              </Section>

              <Section id="quickstart" title="Quick Start">
                <p>
                  Goal: first verified action in under five minutes. Install the SDK from npm or
                  use the monorepo workspace — see <a href="#open-core" className="text-primary hover:underline">open core</a>.
                </p>

                <H3>1. Start the runtime</H3>
                <Code
                  lang="bash"
                  code={`git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
cp .env.example .env   # edit HOST, PORT, DASHBOARD_*, OLLAMA_URL, SITE_*
npm install
npm run dev:runtime
npm run smoke`}
                />

                <H3>2. Install the SDK</H3>
                <Code
                  lang="bash"
                  code={`npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime`}
                />

                <H3>3. Run the agent example (monorepo)</H3>
                <Code lang="bash" code={`npm run example:agent`} />

                <H3>4. Initialize and gate actions</H3>
                <Code
                  lang="typescript"
                  code={`import { SanctumRuntime } from "@sanctum-runtime/sdk"
import { protectAgent, AgentActions } from "@sanctum-runtime/adapter-agent-runtime"

const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await protectAgent(sanctum, {
  actor: "workflow-agent",
  action: AgentActions.SEND_EMAIL,
  context: { to: "user@example.com" },
  offlineMode: true,
  execute: async () => sendEmail(),
})

await sanctum.policy("unlock_door", "verify")`}
                />

                <H3>Direct verify (no execute wrapper)</H3>
                <Code
                  lang="typescript"
                  code={`const result = await sanctum.verifyAction({
  actor: "assistant-agent",
  action: "unlock_door",
  context: { time: "02:13 AM", owner_sleeping: true },
})

if (result.decision === "APPROVED") executeAction()`}
                />
              </Section>

              <Section id="open-core" eyebrow="Strategy" title="Open Source & Enterprise">
                <p>
                  Sanctum uses an <strong>open-core</strong> model: open infrastructure for adoption,
                  private intelligence and enterprise features for moat and revenue.
                </p>

                <H3>Public (open infrastructure)</H3>
                <List
                  items={[
                    "Core runtime SDK — interception, verification, audit, events",
                    "Basic policy engine — Approve, Verify, Block",
                    "Local integrations — Ollama, llama.cpp, offline mode",
                    "Category adapters — agents, ROS2 starters, examples",
                    "CLI, examples, and this documentation",
                    "Community dashboard — logs, actions, runtime status",
                  ]}
                />

                <H3>Private (enterprise & intelligence)</H3>
                <List
                  items={[
                    "Advanced threat intelligence and proprietary risk models",
                    "Fleet orchestration and organization-wide policy sync",
                    "Advanced analytics, trust scoring, behavioral intelligence",
                    "Hosted Sanctum Cloud, compliance, and device attestation",
                  ]}
                />

                <Quote>
                  Public: how Sanctum works. Private: how Sanctum becomes smarter than competitors.
                </Quote>

                <p>
                  License: <strong>MIT</strong> for this repository. Enterprise features may be
                  dual-licensed later. Canonical boundary doc:{" "}
                  <a
                    href="https://github.com/Matik103/sanctum-runtime/blob/main/OPEN_CORE.md"
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OPEN_CORE.md
                  </a>
                  .
                </p>
              </Section>

              <Section id="philosophy" title="Runtime Philosophy">
                <p>Sanctum is not designed around fear.</p>
                <p>It is designed around responsibility.</p>
                <p>We believe advanced AI systems can become deeply valuable tools across:</p>
                <List items={["healthcare", "manufacturing", "research", "home assistance", "logistics", "and infrastructure"]} />
                <p>But intelligence without runtime trust creates operational risk.</p>
                <p>The future of AI will not be determined only by model capability.</p>
                <p>It will also be determined by transparency, reliability, resilience, observability, and trust.</p>
              </Section>

              <Section id="long-term" title="Long-Term Direction">
                <p>Sanctum begins with runtime protection and action authorization.</p>
                <p>Over time, the broader infrastructure vision expands toward:</p>
                <List
                  items={[
                    "synthetic identity",
                    "secure memory systems",
                    "portable trust layers",
                    "local cognition infrastructure",
                    "and trusted autonomy standards",
                  ]}
                />
                <p>The long-term goal is to help establish the foundational trust architecture required for embodied intelligence.</p>
                <p>Not just smarter AI. Trusted AI.</p>
              </Section>

              <Section id="phase" title="Current Phase">
                <p>Our immediate focus is clear:</p>
                <List
                  items={[
                    "build working runtime infrastructure",
                    "support developers",
                    "enable local-first deployments",
                    "establish behavioral observability",
                    "and create practical trust systems for physical AI",
                  ]}
                />
                <p>Execution matters.</p>
                <p>The future infrastructure layer for embodied intelligence must begin with systems that work reliably today.</p>
              </Section>

              <Section id="final" title="Final Principle">
                <Quote>The future will not only ask whether AI is intelligent.</Quote>
                <Quote>It will ask whether AI can be trusted.</Quote>
                <p>Sanctum exists to help answer that question.</p>
              </Section>
            </article>
          </div>
        </div>
      </main>
    </div>
  );
}
