# Sanctum — Product Requirements Document (PRD)

**Version:** 1.4  
**Status:** Active — single source of truth for product and engineering  
**Last updated:** 2026-05-15

---

## 1. Purpose of this document

This PRD defines what Sanctum is, what we build first, how we position it, and the technical and design constraints the team uses for day-to-day development. All features, stack choices, and scope decisions should trace back here unless explicitly superseded.

---

## 2. Executive summary

**Product name:** Sanctum  
**Primary product:** Sanctum Runtime — trust layer between AI reasoning and physical or high-risk execution.

**Tagline:** Trusted Runtime for Physical AI  
**Alternative positioning:** Sovereign Intelligence Infrastructure  
**Market positioning (primary):** **Runtime trust infrastructure for autonomous AI systems** — not “humanoid security” alone (that market is still early). Physical AI and humanoids remain a **flagship** narrative, not the **only** market.

**Core narrative (do not dilute):** We are **not** selling “robot protection” or fear-based “AI dangers.” We sell **trusted execution infrastructure** — observable, permission-aware, auditable, resilient — wherever AI can **do, move, decide, control, access, trigger, or execute**.

**Starting wedge (Phase 1 only):**  
**AI Behavioral Firewall + Action Permission SDK** — prioritize **AI agents** and **local/edge developers** first (market exists today); humanoids and full category adapters follow the shared runtime architecture (**§17**).

---

## 3. Problem statement

As AI becomes embodied (robots, humanoids, industrial systems, smart environments), risks shift from “bad outputs” to **unauthorized or unsafe real-world actions**: cloud dependence, remote manipulation, prompt injection, unsafe command chains, and weak observability. Sanctum exists to provide a **runtime trust layer**: intercept, evaluate, approve/block/escalate, log, and remain usable **local-first / offline-capable** where it matters.

---

## 4. Product definition

### 4.1 What Sanctum is

- **Local-first** runtime security and **action authorization** for physical AI and high-stakes agentic systems.
- Sits between **models**, **devices**, **users**, **cloud**, and **actions**.
- Goals for builders: **observable**, **permission-aware**, **auditable**, **resilient**, **safer to deploy**.

### 4.2 What Sanctum is not (near term)

- Not a full robotics stack replacement.
- Not “block all AI” — the objective is **trusted autonomy**, not fear-based restriction.
- Not the complete long-term synthetic identity / memory platform in v1 — that remains **directional** only.

### 4.3 Open-core strategy (business + product boundary)

**Model:** **Open core + private intelligence layer** — the standard infrastructure playbook (Stripe, Supabase, Vercel, Cloudflare pattern).

| Mental model | Meaning |
|--------------|---------|
| **Public** | “How Sanctum works.” — adoption, trust, ecosystem |
| **Private** | “How Sanctum becomes smarter than competitors.” — moat, revenue, enterprise leverage |

**Risk if wrong:** Open-sourcing too much → lose monetization and differentiation; competitors clone the moat. Hiding too much → developers don’t trust you, adoption and integrations stall.

**North star before revenue:** Become the runtime developers **try first** (adoption, credibility, inspectability).

**Positioning line (preferred):** “Open runtime infrastructure for trusted autonomous AI” — not “open-source robot security.”

#### 4.3.1 Open-source layer (adoption engine)

**License (strategy, not legal advice):** Prefer **Apache 2.0** or **MIT** for OSS tier initially; **dual-license** or commercial terms for enterprise features later.

| Component | Open? | Notes |
|-----------|-------|--------|
| **Core runtime SDK** | **Yes** | Action interception, policy hooks, verification, local runtime connection, audit basics, events |
| **Policy engine (basic)** | **Yes** | Approve / Verify / Block — not the moat |
| **Local runtime integrations** | **Yes** | Ollama connector, local inference bridge, llama.cpp support — reinforces local-first identity |
| **Category adapters** | **Yes** | Agent adapter, ROS2 starter, smart-home examples — ecosystem growth |
| **CLI tools** | **Yes** | e.g. `sanctum init`, `sanctum monitor`, `sanctum policy` |
| **Community dashboard (basic)** | **Partial** | Logs, actions, runtime events — enough to adopt; enterprise UX private |
| **Documentation site** | **Yes** | Public docs are part of the product (onboarding, positioning, trust) |
| **Examples & demos** | **Yes** | Example apps, demo agents, offline demos, policy samples, dashboard starter |

**Target public GitHub layout (evolve from current monorepo):**

```text
sanctum-runtime    — core runtime (this repo: apps/api, packages/runtime-engine, …)
sanctum-sdk          — @sanctum/runtime (packages/sdk in monorepo)
sanctum-docs         — public documentation (may mirror /docs route until split)
sanctum-examples     — example apps, agents, policies
sanctum-ros2         — ROS2 integration (Phase 2)
sanctum-cli          — developer CLI (roadmap)
```

#### 4.3.2 Private layer (intelligence + enterprise)

**Paid product:** Sanctum Enterprise / Sanctum Cloud — revenue, moat, enterprise leverage.

| Component | Private | Why |
|-----------|---------|-----|
| **Advanced threat intelligence** | **Yes** | Behavioral scoring, anomaly models, attack heuristics, prompt-injection intelligence, proprietary risk engine — do not expose full detection logic |
| **Enterprise orchestration** | **Yes** | Fleet management, org controls, centralized runtime, deployment orchestration, enterprise policy sync |
| **Advanced runtime analytics** | **Yes** | Behavior graphs, predictive threats, trust scoring, behavioral intelligence |
| **Cloud infrastructure** | **Yes** | Secure sync, enterprise APIs, managed runtime, multi-org |
| **Compliance systems** | **Yes** | Healthcare/industrial governance, audit certification, signed runtime verification |
| **Device attestation & secure identity** | **Yes** | TPM, hardware trust, signed runtime identities |
| **Proprietary runtime intelligence** | **Yes** | Aggregated anomaly patterns, execution intelligence, trust models, telemetry datasets |
| **Hosted Sanctum platform** | **Yes** | Sanctum Cloud / Enterprise control plane |

**Private repos (future):** `sanctum-enterprise`, `sanctum-cloud`, `sanctum-intelligence`.

**Current repo note:** Phase 1 MVP may ship heuristic + local-model risk in `runtime-engine` for demos; treat **advanced / fleet / cloud intelligence** as the line for what moves to private packages as the product matures (**§5** scope stays OSS-friendly basics).

#### 4.3.3 Public documentation structure

Public docs are **not** API reference only — they are developer onboarding, category positioning, trust building, ecosystem signaling (Stripe / Supabase / Vercel / Cloudflare quality bar).

| # | Section | Public content |
|---|---------|----------------|
| 1 | **Introduction** | What Sanctum is; runtime trust; local-first; action verification; behavioral monitoring |
| 2 | **Core concepts** | Runtime, policies, action verification, threat detection, offline mode, audit logging, runtime integrity |
| 3 | **Quick start** | Working in **&lt; 5 minutes** — install SDK, init runtime, first verification |
| 4 | **SDK reference** | Methods, APIs, events, policy hooks, adapters (e.g. `verifyAction`, policy CRUD, `onThreatDetected` roadmap) |
| 5 | **Policies** | Approve / Verify / Block; action categories; policy flows; examples |
| 6 | **Runtime events** | e.g. `action.requested`, `action.blocked`, `threat.detected`, `runtime.offline`, `verification.required` |
| 7 | **Local runtime setup** | Ollama, local models, offline mode, local verification — **differentiation** |
| 8 | **Integration guides** | AI agents, robotics, smart home, local AI, ROS2, Node, Python |
| 9 | **Architecture overview** | **High level only:** AI → Sanctum → Policy → Execution — **no** internal scoring, proprietary threat models, or enterprise orchestration internals |
| 10 | **Open-source examples** | Example apps, demo agents, offline demos, policies, dashboard starter |

Canonical implementation: marketing **`/docs`** route (**§6.3**) until a dedicated docs site ships.

#### 4.3.4 Summary matrix

| Open (infrastructure) | Private (intelligence + enterprise) |
|------------------------|-------------------------------------|
| Runtime SDK, adapters, local integrations, policy framework, examples, docs, basic dashboard, developer tooling | Advanced detection, orchestration, enterprise controls, behavioral intelligence, analytics, cloud infra, trust scoring, compliance, attestation |
| **Purpose:** adoption, trust, ecosystem | **Purpose:** moat, monetization, enterprise leverage |

### 4.4 Defensibility and competitive reality

**Reality for infrastructure startups:** The **idea** is easy to copy — landing pages, SDK concepts, feature lists, UI, repos, messaging. The **company** is not. Defensibility does **not** come from patents, secrecy, or “stealth mode” alone (especially in AI — the market moves fast). If the wedge is real, **parts will be copied**. The strategic goal is **not** to prevent all copying; it is to **become the trusted default before others do**.

**What is hard to copy (real moats):**

| Moat | Why it compounds |
|------|-------------------|
| **Ecosystem adoption** | Developers wire APIs, integrations, policies, workflows, plugins, robotics paths — switching hurts later (Stripe, Supabase, Cloudflare, Docker, K8s pattern). |
| **Trust reputation** | Reliability, privacy, local-first, safe AI infra — brand value for enterprise and robotics. |
| **Runtime data + behavioral intelligence** | Anomaly datasets, behavior models, action risk scoring, execution intelligence — proprietary operational knowledge as more workloads flow through Sanctum. |
| **Deep integrations** | ROS2, Jetson, local AI runtimes, robotics APIs, enterprise policy, edge — **embedding** in workflows. |
| **Community + developer trust** | Elite docs, clean APIs, fast onboarding, local-first that works, premium feel — developers remember great infra. |
| **Execution speed** | Copycats often stay shallow (visuals, buzzwords); sustained quality, support, integrations, architecture, and momentum differentiate. |

**Category ownership:** Aim for **mental association** — when teams think *AI runtime trust*, *physical AI security*, *AI action verification*, they think **Sanctum**. That beats relying on “we had the idea first.”

**Open-source and licensing (strategy, not legal advice):** Prefer adoption-friendly licenses for the OSS tier (**Apache 2.0**, **MIT**, or **dual-license** later). Align with **§4.3**: open core SDK; **enterprise runtime / orchestration / advanced intelligence** proprietary — common infra pattern.

**What to avoid:** Obsessing over secrecy (kills adoption and trust in infra). Over-indexing on patents as primary defense vs large competitors — **execution and adoption** matter more for software velocity.

**Comfortable truth:** Success attracts **large competitors**, **forks**, and **copycats** — that signals value. Winners tend to be teams that **execute fastest** and **earn trust first**.

**Long-term split (reinforces §4.3):**

| Open | Closed / paid |
|------|----------------|
| SDK, docs, integrations, community tooling | Enterprise orchestration, advanced monitoring, runtime intelligence, fleet management, compliance, behavioral analytics, hosted infra |

**Moat summary:** Not “first idea” — **runtime trust**, ecosystem embedding, adoption, behavioral intelligence, enterprise reputation, and **standards-level positioning**.

### 4.5 Market map (strategic)

**Core category:** Systems that **execute actions**. If execution has real-world or high-stakes effect, Sanctum is relevant.

**Outreach line (use this):**  
> “Sanctum provides runtime trust infrastructure for autonomous AI systems.”

**Avoid:** “We stop rogue robots,” “robot security company,” fear-only positioning.

**What buyers care about (language):** permissions, compliance, audit logs, safe automation, observability, local runtime, offline execution, governance — not hype.

| Priority | Segment | Why now |
|----------|---------|---------|
| **1 — MVP** | **AI agents** (browser, coding, workflow, API, operators) | Exists today; fastest demos and adoption |
| **2** | Local AI / edge (Ollama, on-device runtimes) | Aligns with local-first PRD |
| **3** | Robotics startups (software layers, not full stack) | Integrate trust vs build in-house |
| **4** | Autonomous workflow / automation platforms | Enterprise-adjacent, shorter cycles than humanoids |
| **Later** | Humanoids (flagship long-term), smart home, industrial, healthcare, defense, mobility, companions | Reuse same core; add **adapters** + category UI |

**12 expansion categories (one runtime, many adapters):** AI agents · Humanoids · Embodied AI · Smart home AI · AI operating systems · Robotics startups (integrators) · Enterprise AI automation · Defense/security robotics · Healthcare robotics · Autonomous vehicles/systems · AI companion systems · Industrial automation. Details and per-category deliverables: **§17**.

**Go-to-market (immediate):** Developer ecosystem (agent builders, ROS2/Ollama communities, GitHub) and startups; **enterprise** after demos, adoption, and runtime credibility.

### 4.6 Developer access model (how Sanctum is used)

**Design bar:** Like **Stripe**, **Docker**, **Supabase** — not a product users “open,” but a **layer developers install into systems**.

**Sanctum is NOT:** a chatbot, a standalone UI app, a robot controller, or “dashboard-first” tooling.  
**Sanctum IS:** **runtime middleware** — invisible, embedded, always-on — between AI reasoning and execution (evolving from “firewall for AI actions” toward an **operating layer for autonomous behavior**).

#### 4.6.1 Three access paths

| Path | Phase | What it is |
|------|-------|------------|
| **A — Local SDK** | **Phase 1 (primary)** | `npm install @sanctum/runtime` — runs **inside** the agent, robotics stack, or backend. **Not** a separate app. |
| **B — Local runtime service** | Phase 2 | `npx sanctum init` — optional daemon on device (Jetson, Pi, dev machine): intercepts actions, Ollama, policies. “Docker daemon for AI trust.” |
| **C — Cloud dashboard** | Optional control plane | Policy UI, logs, threats, team controls — **visibility only**; **not** the runtime itself. |

#### 4.6.2 What runs where

| On device / in process (OSS core) | In cloud (optional, enterprise) |
|-----------------------------------|----------------------------------|
| Runtime core, policy engine, action interceptor, local AI (Ollama), audit logger | Dashboard, sync, team management, advanced analytics |

#### 4.6.3 Execution flow (mandatory gate)

```text
Before:  AI → executes action directly          ❌
After:   AI → Sanctum Runtime → Decision → Execution   ✓
```

Decisions: **approve** · **verify** · **block** (see **§5.1**, Policy Manager).

#### 4.6.4 Developer onboarding (target UX)

1. `npm install @sanctum/runtime`  
2. `const sanctum = new SanctumRuntime({ offlineMode: true })` (or `baseUrl` to local API)  
3. Wrap agent: `agent.use(sanctum.middleware())` **or** robotics: `robot.attach(sanctum.runtime())`  
4. Policies: `await sanctum.policy("unlock_door", "verify")`  
5. Run — every material action flows through Sanctum  

**Monorepo note:** package lives at `packages/sdk`; npm name **`@sanctum/runtime`**.

#### 4.6.5 What operators see (when runtime is active)

Users do **not** live inside Sanctum. They see **signals** in the optional dashboard: live activity (requested / approved / blocked / verification required), policy enforcement view, anomalies (basic in OSS; advanced private **§4.3.2**).

#### 4.6.6 Who installs what

| Audience | Installs |
|----------|----------|
| **Developers** | npm package; optional local daemon (later) |
| **Robotics / edge** | Runtime service on device |
| **Enterprise** | Runtime across fleet + dashboard |
| **End users** | **Nothing** — trust via products built on Sanctum |

#### 4.6.7 Phase 1 build order (concrete)

**Must have:** `@sanctum/runtime`, action interceptor, policy engine (approve/verify/block), Ollama bridge, audit logs, simple dashboard.  
**Not yet:** full robotics integrations, enterprise cloud, complex distributed architecture.

---

## 5. MVP scope (build only this first)

Everything outside this list is **out of scope** for MVP unless reprioritized in this PRD.

### 5.1 Action verification

- AI (or agent) requests an action → Sanctum **intercepts** → checks **permissions / policy** → **approve | deny | escalate | hold**.
- Clear API contract for “action + context + identity + device trust signals (as available).”

### 5.2 Behavioral monitoring

Detect and surface (initially rules + heuristics acceptable; ML later):

- Unusual requests / sequences  
- Unsafe command chains  
- Suspicious remote prompts  
- Escalation attempts  
- Policy violations  

Goal: **signal and enforce boundaries**, not eliminate all intelligence.

### 5.3 Offline mode (major differentiator)

Demonstrate and ship:

- Local execution path  
- Disconnected / degraded state  
- Secure fallback behavior (deny-by-default or policy-defined fallback)  
- Clear UX and SDK flags for offline capability  

### 5.4 Audit logs

Log **material runtime events** (minimum fields):

- Who requested  
- What action / resource  
- Why / policy path (human-readable + machine reference)  
- Model or agent confidence **when available**  
- Approval state (allowed / denied / pending / escalated)  
- Timestamp + correlation id  
- Anomaly flags (if any)  

Enterprises require **observability**; this is non-negotiable for MVP credibility.

---

## 6. User-facing surfaces

### 6.1 Marketing website

**Purpose:** Narrative, trust, developer pull, early access.

**Planned stack:** Next.js, Tailwind CSS, Framer Motion, shadcn/ui.

**Required sections (content + UX):**

1. **Hero** — Headline: *Runtime trust infrastructure for autonomous systems*. Subhead: between AI reasoning and execution — permissions, verification, audit, local governance. CTAs: **Get Early Access**, **View Documentation**. Background: dark animated grid + subtle neural motion (restrained).
2. **Problem** — Title: *AI Can Think. But Can You Trust It?* Themes: cloud dependence, hijacking, unsafe actions, prompt injection, privacy.
3. **Solution** — Title: *The Runtime Layer for Trusted Autonomy.* Three pillars: **Action Firewall**, **Local Cognition**, **Behavioral Monitoring**.
4. **Architecture** — Interactive diagram: User → AI Model → **Sanctum Runtime** → Physical Actions (must feel concrete).
5. **SDK** — Snippet developers copy mentally in 10 seconds, e.g. `SanctumRuntime` with `offlineMode`, `actionVerification`, `behavioralMonitoring`.
6. **Use cases** — Lead with **AI Agents**; then humanoids/robotics, industrial, drones, smart home, enterprise automation (**§4.5**).
7. **Trust / metrics** — Actions verified, threats blocked, offline integrity, runtime latency (simulated acceptable initially with honest labeling).
8. **Final CTA** — *Build AI Humans Can Trust* + **Request Access**.

**CTA destinations (implemented in `src/lib/site-links.ts`):**

| Control | Points to | Purpose |
|---------|-----------|---------|
| **Docs** / View Documentation | `/docs` on marketing deploy | Public technical docs (**§6.3**) |
| **Get Early Access** / Request Access | `VITE_EARLY_ACCESS_URL` or GitHub early-access issue | Waitlist / design partners — **not** runtime install |
| **GitHub** (footer) | `VITE_GITHUB_URL` → public OSS repo | Source, issues, OSS adoption |
| **Try runtime** (in docs quick start) | Clone repo + `npm run dev:runtime` | Developer path (**§4.6**) |

### 6.2 Dashboard (product)

**Planned stack:** Next.js App Router, TypeScript, Zustand, TanStack Query.

**MVP modules:**

- Robot / agent **sessions**  
- **Anomaly** log  
- **Action approvals** queue / history  
- **Device trust** scores (define v1 formula in eng spec; can start simple)  
- **Local / offline** state visibility  
- **Permission** flows (policies, roles, exceptions as v1 allows)  

**Auth:** Use company **external Supabase** (see §7) for identity; dashboard is authenticated, role-aware (details in security appendix as implemented).

**Open-core boundary:** MVP dashboard in this repo is the **community/basic** tier (**§4.3.1**). Enterprise fleet, org views, advanced analytics, and compliance UX stay **private** (**§4.3.2**).

### 6.3 Public documentation (`/docs`)

**Purpose:** Developer onboarding + trust + ecosystem (**§4.3.3**). Same narrative as marketing site; deeper technical depth.

**Required sections (align TOC with §4.3.3):** Introduction, core concepts, quick start (&lt; 5 min), SDK, policies, runtime events (document as implemented / roadmap), local runtime (Ollama), integration guides, high-level architecture, open-source & examples, **open-core** (what is public vs private — transparency without giving away moat).

**Do not publish in public docs:** Internal risk scoring formulas, full threat-model weights, enterprise orchestration internals, proprietary telemetry schemas.

**Quick start contract (canonical packages):**

```bash
npm install @sanctum/runtime @sanctum/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from '@sanctum/runtime'
import { protectAgent, AgentActions } from '@sanctum/adapter-agent-runtime'

const sanctum = new SanctumRuntime({ baseUrl: 'http://127.0.0.1:3001' })
await protectAgent(sanctum, {
  actor: 'workflow-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'user@example.com' },
  execute: async () => { /* ... */ },
})
```

---

## 7. Data, auth, and realtime — **external Supabase**

**Decision:** Sanctum uses a **dedicated external Supabase project** (company-owned), not an ad-hoc database per developer machine for production-bound features.

**Use Supabase for:**

- **PostgreSQL** — canonical store for users/tenants (if multi-tenant), devices, sessions, audit events, policy metadata, approval records.  
- **Authentication** — email/OAuth/etc. as configured; JWT/session integration with app and API.  
- **Row Level Security (RLS)** — tenant and user isolation for all user-scoped tables.  
- **Realtime** (where applicable) — live updates for dashboard (sessions, approvals, anomalies) without overbuilding; prefer clear channels and filters.

**Application access pattern:**

- **Option A (recommended for greenfield):** Supabase client for auth + realtime; server-side use **service role** only in trusted backend paths; never expose service role to the browser.  
- **Option B:** **Prisma** (or Drizzle) against the same Postgres connection string for migrations and complex reporting — still backed by Supabase Postgres. Choose one ORM strategy per service and document it.

**Non-goals for MVP:** NATS, multi-region orchestration — **later**; WebSockets directly in Fastify only if Supabase Realtime is insufficient (justify in ADR).

---

## 8. Backend and services

**Core API (planned):** Node.js, TypeScript, **Fastify** — fast, clear boundaries for SDK and dashboard.

**Responsibilities:**

- Policy evaluation orchestration (may call local rules engine first).  
- Audit **write path** (durable, ordered, correlatable).  
- Webhook / SDK ingestion endpoints with authentication (API keys + Supabase user context as appropriate).  
- Rate limits and abuse basics for public demo endpoints.

**Later:** Rust microservices for hot paths; **Go** only if an ADR warrants it.

---

## 9. AI runtime layer

**Principle:** **Local inference first** — demos and credibility without mandatory cloud model dependency.

**Compatible directions:** Ollama, llama.cpp, DeepSeek local, Qwen local (exact packaging TBD per integration).

**Reference models (current 8 GB dev machine):** **Qwen2.5-3B-Instruct Q4_K_M** as the primary local agent for realistic scenario work; **Qwen2.5-0.5B-Instruct Q4_K_M** for fast plumbing. Trust decisions remain **policy + runtime** (§5), not model scale. Larger models are for a higher-RAM machine later.

**Security note:** Local models still go through **Sanctum action verification** before side effects.

---

## 10. Security layer (phased)

**MVP:** JWT (via Supabase), API keys for SDK/server, **device keys** (register + rotate story), least-privilege service roles, audit integrity (append-only patterns where possible).

**Later:** TPM / hardware attestation, Rust enforcement services, advanced threat models.

---

## 11. Robotics and SDK roadmap

**Phase 1:** Python SDK, Node SDK (align public API surface where possible).  
**Phase 2:** ROS2, NVIDIA Jetson, Raspberry Pi, Unitree — **after** core runtime + audit story is credible.

---

## 12. Design system (canonical)

### 12.1 Palette

| Token | Hex |
|--------|-----|
| Background | `#070B14` |
| Surface | `#111827` |
| Elevated surface | `#1A2233` |
| Primary accent | `#4F7CFF` |
| Secondary accent | `#8B5CF6` |
| Success | `#10B981` |
| Warning | `#F59E0B` |
| Danger | `#EF4444` |
| Text primary | `#F9FAFB` |
| Text secondary | `#9CA3AF` |

### 12.2 Typography

- **Headlines:** Space Grotesk  
- **Body:** Inter  

### 12.3 UI personality

**Yes:** Military-grade *trust*, secure cognition, premium infrastructure, minimal dark UI, clean charts, subtle motion.  
**No:** Playful “AI slop,” neon cyberpunk overload, gratuitous robots everywhere.

**Reference tone:** Linear, Stripe, Palantir, Vercel, Anduril — combined **restraint**.

### 12.4 Buttons

- Primary: blue glow, subtle border, hover elevation.  
- Secondary: glass, border-first.  
- Corners: rounded, not toy-like.

---

## 13. Engineering roadmap (sequenced)

### Week 1

- Landing page (structure above) + **brand system** (tokens, type, components).  
- **Dashboard shell** + navigation + empty states.  
- **Authentication** wired to **external Supabase**.  
- **SDK mock** (types + stub behavior + docs snippet) so demos do not wait on full backend.

### Week 2

- **Action verification engine** (v1 rules + API).  
- **Permission UI** (minimal viable roles/policies).  
- **Audit logs** (write + list + filter + export stub).

### Week 3

- **Local runtime demo** (happy path + failure path).  
- **Offline mode simulation** (real disconnect behavior, not only a toggle graphic).  
- **Threat / anomaly demo** (clear false-positive strategy in UX copy).

---

## 14. Success metrics (MVP)

- Developer can run **demo in <15 minutes** from docs.  
- **Action** is blocked/allowed with **auditable reason** every time.  
- **Offline** path demonstrably different from online (observable in UI + logs).  
- **Enterprise narrative** holds in a 10-minute walkthrough without hand-waving security.

---

## 15. Glossary

| Term | Meaning |
|------|--------|
| **Embodied intelligence** | AI that can affect the physical world or high-risk digital side effects. |
| **Runtime** | The execution boundary where Sanctum evaluates and logs actions. |
| **Open-core** | OSS infrastructure layer (**§4.3.1**); paid intelligence + enterprise layer (**§4.3.2**). |
| **Intelligence layer** | Private threat scoring, behavioral models, fleet analytics, proprietary telemetry (**§4.3.2**). |
| **Autonomous AI systems** | AI that executes actions with operational effect (agents, robots, automation, edge). |
| **Category adapter** | Pluggable action schema + policies + UI module for a market segment (**§17**). |
| **Runtime trust** | Intercept, evaluate, approve/verify/block, audit — between reasoning and execution. |

---

## 16. Document control

- **Owner:** Product + eng lead (assign names internally).  
- **Changes:** Version bump + date; breaking scope changes require explicit review.  
- **Repo alignment:** If this repository ships a TanStack Start / Vite surface before Next.js split, treat **§6–§8** as target architecture and track migration or dual-hosting in the engineering backlog — **§7 (Supabase)** is fixed regardless of frontend host.

---

## 17. Category expansion blueprint (architecture)

**Principle:** Sanctum is **one runtime trust layer**, not twelve products. Build the **core once**; expand via **category adapters** (action schemas, policy presets, dashboard modules) — not separate systems.

### 17.1 Build once (shared core)

All categories reuse:

- Action interception and verification (**§5.1**)
- Policy engine (**§5**, Policy Manager UI)
- Threat / anomaly detection (**§5.2**)
- Audit logging (**§5.4**)
- Local / offline execution (**§5.3**, **§9**)
- Realtime events (Supabase **§7** when wired)

Current monorepo direction (evolve, do not duplicate):

```text
packages/
  sdk/                 # public API
  runtime-engine/      # intercept → decide → audit
  policy-engine/
  audit-system/
services/
  ollama-bridge/       # local risk analysis
packages/adapters/     # NEW — per category (Phase 2+)
  agent-runtime/       # FIRST adapter after MVP
  humanoid-runtime/
  smart-home/
  industrial/
  …
apps/
  api/
  dashboard/           # shared shell; category-specific views/modules
```

### 17.2 Category phases (product, not MVP commitment)

| Category | Phase | Adapter / schema focus | Dashboard additions (examples) |
|----------|-------|------------------------|--------------------------------|
| **1. AI agents** | **Now (MVP+)** | `send_email`, `delete_file`, `execute_terminal`, `transfer_funds`, … | Agent sessions, workflows, injection detections |
| **2. Humanoids** | Flagship later | `unlock_door`, `move_to_location`, context-aware policies | Movement timeline, location context, trust score |
| **3. Embodied AI** | Later | Arms, carts, drones, kiosks | Physical state, actuator logs |
| **4. Smart home** | Later | Locks, cameras, hubs | Device grid, trust zones |
| **5. AI OS** | Later | File/system/app permissions | Process monitor, execution graph |
| **6. Robotics startups** | Ongoing | SDK, `sanctum.protect()`, presets, webhooks | Integration health |
| **7. Enterprise automation** | Post-adoption | Approval chains, RBAC, governance | Org view, workflow maps |
| **8. Defense / security** | Later | Hardened local-only, signed policies, encrypted audit | Zero-cloud mode, integrity |
| **9. Healthcare** | Later | Patient-safe policies, compliance | Oversight, compliance logs |
| **10. Autonomous mobility** | Later | Navigation / routing commands | Route telemetry, incidents |
| **11. AI companions** | Later | Memory / interaction boundaries | Memory access logs |
| **12. Industrial** | Later | Machinery, emergency stop | Factory map, equipment trust |

**UI principle:** Dashboard **adapts per category** (humanoid → locations; smart home → devices; agents → workflows) but always shows the same **verification, policies, logs, threats**.

**Integration north star:** One-line style integration for partners (e.g. `sanctum.protect(agent)` / `verifyAction`) — document in SDK **§11** roadmap.

**Scope gate:** New adapter or category UI requires PRD update here and must not expand **§5 MVP** without explicit reprioritization.

---

## 18. Feature verification (development)

Every feature or product-facing change must be **justified against this PRD** (correct section cited in PR descriptions or internal notes). Do not expand MVP scope (**§5**), add category adapters (**§17**), or reorder the roadmap (**§13**) without updating this document.

**Developer entry point:** **`DEVELOPMENT.md`** at the repository root links here and to Cursor rules for day-to-day reliance without hunting sections.

**Enforcement in-repo:** Cursor loads **`.cursor/rules/prd-alignment.mdc`** (`alwaysApply: true`) so agents map work to PRD sections, respect **§7 (external Supabase)** and open-core boundaries (**§4.3** — **§4.4** for adoption/defensibility tradeoffs), and flag conflicts instead of drifting silently.

---

*End of PRD.*
