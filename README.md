# Sanctum Runtime

**Runtime trust infrastructure for autonomous agent fleets.**

Autonomous agents don't just talk — they act. They send emails, move robots, transfer funds, delete records, call production. Every one of those actions needs a trusted answer to a single question: *should this happen right now, given who asked, what the risk is, and what the policies say?*

Sanctum answers that question at runtime — before the side effect runs — with detection, containment, signed proof, human approval, and a full audit trail. Not a chat filter. Not a log aggregator. **The decision layer.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm @sanctum-runtime/sdk](https://img.shields.io/npm/v/@sanctum-runtime/sdk?label=npm%20sdk)](https://www.npmjs.com/package/@sanctum-runtime/sdk)
[![GitHub stars](https://img.shields.io/github/stars/Matik103/sanctum-runtime?style=social)](https://github.com/Matik103/sanctum-runtime)

```
  agent proposes action
        │
        ▼
   ┌──────────────────────────────────────────────────┐
   │  Sanctum Runtime                                  │
   │  Shield detection · blast-radius · source trust   │
   │  policy engine · risk model · anomaly detection   │
   │  custom containment rules · time-bounded grants   │
   └──────────────────────────────────────────────────┘
        │  signed action_token (HMAC, 5 min TTL)        audit + evidence
        ▼
  executor verifies → side effect runs → result reported back
```

**About this repo:** open-source runtime trust infrastructure for autonomous AI agents, robots, MCP tools, smart home, financial and healthcare workflows. Sanctum Shield behavioral detection and containment · operator-defined containment rules · per-agent threat intelligence · token rotation and lifecycle management · zero-install agent connections · signed action tokens · blast-radius scoring · source-trust classification (indirect-prompt-injection defense) · dual-approver workflows · auto-escalation · fleet kill switch · policy replay · SOC2 + NIST AI RMF evidence · 16 framework adapters · Python SDK · Docker. MIT · `npm install @sanctum-runtime/sdk`

## What's in this release (v0.1.2)

**Sanctum Shield — proactive behavioral detection and containment**
- Deterministic signal engine across 8 categories: identity, behavior, injection, financial ($1k/$10k tiers), physical, secrets, security controls, blast radius
- Score floors ensure high-blast and critical-blast actions are never under-rated
- **Custom operator rules** — define your own containment patterns per org: action glob, financial threshold, JSONB conditions; choose BLOCK / REQUIRE_VERIFICATION / LOG_ONLY
- Containment events auto-resolve when an operator resolves the linked audit entry
- 30-second in-process rule cache with immediate invalidation on write

**Agent fleet management — full lifecycle from the dashboard**
- **Per-agent threat summary** — 24h blocked/held/approved counts, worst Shield level, max anomaly score
- **Activity drill-down** — click any agent to see its filtered audit log and active policy grants
- **Token rotation** — one click issues a new token and immediately invalidates all previous ones (`token_iat_min`)
- **Download .env** — instantly export `SANCTUM_AGENT_TOKEN` + `SANCTUM_API_URL` for any agent
- **Time-bounded policy grants** — approve an agent for a specific action for N minutes; no re-interruptions during the window
- **Zero-install connections** — any agent connects via direct HTTP with `X-Agent-Token`; no SDK required. Mobile agents, browser agents, and scripts connect the same way

**Production hardening**
- Structured pino logging throughout — no more `console.log` escaping the log drain
- Performance indexes: `audit_events(actor)`, `audit_events(action)`, containment auto-resolve index
- Webhook dead-letter endpoint: `GET /v1/webhooks/dead`
- `Dockerfile` — production multi-stage Docker image

**CLI expanded** (`@sanctum-runtime/cli`): 3 → 11 commands including `audit`, `agents rotate`, `shield events`, `webhooks dead`

**Earlier features still shipping:**
- Signed action tokens · blast-radius scoring · source-trust / indirect-injection defense
- Dual approver + auto-escalate · fleet kill switch · policy replay
- NIST AI RMF + SOC2 evidence · 16 framework adapters · domain policy packs
- Python SDK · Ollama / OpenAI-compatible / heuristics-only risk models

| | |
|---|---|
| **Start** | [START_HERE.md](./START_HERE.md) · [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) · [Autonomy infrastructure](./docs/AUTONOMY_INFRASTRUCTURE.md) · [Sanctum vs guardrails](./DEVELOPER_GUIDE.md#sanctum-vs-guardrails) · [CATEGORIES.md](./CATEGORIES.md) |
| **Production** | [PHASE_3.md](./PHASE_3.md) · [PRODUCTION_OPS.md](./PRODUCTION_OPS.md) · [RENDER.md](./RENDER.md) |
| **Install** | `npm install @sanctum-runtime/sdk` · `pip install sanctum-runtime` · [integrations](./docs/integrations/) · [CLI](./packages/cli/) |
| **Help** | [SUPPORT.md](./SUPPORT.md) · [Issues](https://github.com/Matik103/sanctum-runtime/issues) · [Discussions](https://github.com/Matik103/sanctum-runtime/discussions) |
| **Scope** | [OPEN_CORE.md](./OPEN_CORE.md) (OSS vs enterprise) |

---

## Who this is for

You are building **AI agents**, **LLM apps**, **workflow automation**, or **robotics software** and need a real answer to:

> *”What happens when the model tries to unlock a door, send a wire, charge a card, delete a record, or call production — and how do I know if it's trying to do something it shouldn't?”*

Sanctum is for:

- **Agent builders** — LangChain, CrewAI, custom Node/Python agents, MCP servers, “agentic” SaaS
- **Agent fleet operators** — manage dozens of agents, rotate credentials, see per-agent threat summaries, grant time-bounded approvals
- **Platform engineers** — gate **function calling / tool use** across your product with approve · verify · block
- **Security-minded teams** — behavioral detection, containment rules, and a full audit trail — without vendor lock-in
- **Mobile-first operators** — approve or block actions from your phone; agents connect without installing anything
- **Local-first devs** — **Ollama**, GGUF, vLLM, or OpenAI-compatible APIs for risk scoring
- **Compliance teams** — SOC2, NIST AI RMF, HIPAA evidence exports; policy replay; dual-approver workflows

If you only need chat guardrails, look at prompt filters. If you need **execution control and fleet visibility**, you are in the right place.

---

## Sanctum vs other runtime-control tools

|                                              | Sanctum Runtime | Tracehold | GuardPlane | AgentID | Repello Argus / Guardion |
|----------------------------------------------|:---------------:|:---------:|:----------:|:-------:|:------------------------:|
| **Open source (MIT)**                        | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Pre-execution action gate**                | ✅              | ✅        | ✅         | ✅      | partial                  |
| **Behavioral detection + containment**       | ✅              | partial   | partial    | partial | partial                  |
| **Operator-defined containment rules**       | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Per-agent threat intelligence**            | ✅              | ❌        | ❌         | partial | ❌                       |
| **Token rotation + immediate invalidation**  | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Time-bounded policy grants**               | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Zero-install agent connections**           | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Signed action tokens**                     | ✅              | partial   | ❌         | ❌      | ❌                       |
| **Blast-radius scoring**                     | ✅              | ❌        | ❌         | partial | ❌                       |
| **Source-trust / indirect-injection defense**| ✅              | ❌        | ❌         | ❌      | partial                  |
| **Dual approver + auto-escalate**            | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Policy replay against history**            | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Robotics / ROS2 / physical world**         | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Local LLM (Ollama) risk model**            | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **SOC2 + NIST AI RMF evidence**              | ✅              | partial   | ❌         | partial | partial                  |
| **Domain policy marketplace**                | ✅              | ❌        | ❌         | ❌      | ❌                       |
| **Python + TypeScript SDKs**                 | ✅              | partial   | ❌         | partial | ❌                       |
| **16 framework adapters**                    | ✅              | ~4        | endpoint   | ~3      | ~2                       |
| **Docker + self-host**                       | ✅              | ❌        | ❌         | ❌      | ❌                       |

The wedge: **we are not "AI agent security"**. We are the trust infrastructure between *any* autonomous system and *any* real-world action — agents, robots, smart home, industrial, healthcare, financial, mobility, workflows. Everyone else clusters around chat / cloud-ops / endpoint. We sit on the decision point, and we give operators real-time visibility into what every agent in their fleet is doing.

---

## Sanctum vs guardrails

Most AI **guardrails** protect **what the model says** (prompts and replies). Sanctum protects **what the system does** (tools, APIs, robots, workflows) *before* side effects happen.

```text
  User / sensor input
        │
        ▼
  ┌─────────────────────────┐
  │ Content guardrails       │  jailbreak, toxicity, PII in chat,
  │ (moderation, NeMo, etc.) │  structured output, prompt shields
  └───────────┬─────────────┘
              ▼
        Model plans an action
              │
              ▼
  ┌─────────────────────────┐
  │ Sanctum Runtime          │  policy + risk → APPROVE · VERIFY · BLOCK
  │ (this repo)              │  audit, webhooks, human approval, resume
  └───────────┬─────────────┘
              ▼
        Real execution (email, door, DB, robot, …)
```

| Layer | Typical tools | What they control |
|-------|----------------|-----------------|
| **Input / output guardrails** | OpenAI moderation, Llama Guard, Guardrails AI, NeMo, Azure Content Safety | Toxic or policy-violating **text** |
| **Tool/schema guardrails** | JSON schema, static allowlists | Shape of a tool call, not *whether it should run now* |
| **Sanctum Runtime** | This project | **Action + context** — approve, hold for a human, or block; durable audit |

**Use both.** Guardrails on chat; Sanctum on anything that changes the world.

| You are building… | Guardrails alone | + Sanctum |
|-------------------|------------------|-----------|
| Chat-only assistant | Often enough | Optional for dangerous tools |
| Agent with tools (email, files, APIs) | Not enough | **Recommended** |
| Robotics, smart home, industrial commands | Not applicable to motion/access | **Essential** |
| Finance, healthcare, infra automation | Partial | **Essential** for approval + audit on actions |

**Why prompts are not enough:** telling the model “ask before deleting” is not enforcement. Sanctum evaluates **server-side** policies, emits webhooks (`verification.required`, `action.blocked`, `verification.resolved`), and lets operators **resume** after approval — without rebuilding a state machine per action.

**Production:** self-host or deploy the API ([HOSTED.md](./HOSTED.md), [RENDER.md](./RENDER.md)); use `X-Sanctum-Key`, webhooks to your app, and persistent audit (optional Supabase). Details: [DEVELOPER_GUIDE.md § Sanctum vs guardrails](./DEVELOPER_GUIDE.md#sanctum-vs-guardrails).

---

## What it does (in one sentence)

**AI proposes an action → Sanctum evaluates policy + risk → approve, pause for a human, or block → you execute (or you don’t).**

```text
  Before (risky)     AI / robot / automation ─────────────────► side effects
  With Sanctum       your stack ──► Sanctum Runtime ──► decision ──► execution
```

Decisions: **APPROVED** · **REQUIRE_VERIFICATION** (human review) · **BLOCKED**

---

## Quick start

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
cp .env.example .env
npm install
npm run dev:runtime    # API + dashboard
npm run smoke          # another terminal — integration check
```

**Use it from your app (npm):**

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from "@sanctum-runtime/sdk";
import { protectAgent, AgentActions } from "@sanctum-runtime/adapter-agent-runtime";

const sanctum = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL!, // e.g. http://127.0.0.1:3001
});

await protectAgent(sanctum, {
  actor: "support-bot",
  action: AgentActions.SEND_EMAIL,
  context: { to: "user@example.com", heard: "Send them the reset link" },
  execute: async () => sendEmail(),
});
```

Works **without** the dashboard. Works **with** Ollama off (heuristics + policies). Works **self-hosted** on your infra.

---

## One runtime — 12 categories (not agents-only)

The **same** `verifyAction()` API gates software and physical actions. Category adapters add convenience; the core is shared.

| Category | Example actions you can gate today |
|----------|----------------------------------|
| AI agents | `send_email`, `execute_terminal`, tool / MCP calls |
| Humanoids & embodied AI | `unlock_door`, `move_robot`, `move_to_location` |
| Smart home | `disable_alarm`, locks, device commands |
| Robotics (ROS / AMR) | `navigate`, `dock`, any custom motion command |
| AI OS / desktop agents | `delete_file`, `install_package` |
| Workflow automation | `run_workflow`, integrations, CRM updates |
| Industrial | `emergency_stop`, `start_line`, setpoints |
| Mobility, healthcare, companions, … | Your `action` string + policies |

**Agent adapter** ships now (`protectAgent`). Every other row uses the SDK directly — see **[CATEGORIES.md](./CATEGORIES.md)** for examples and search terms per segment.

---

## Why teams pick Sanctum

| You want… | Sanctum gives you… |
|-----------|-------------------|
| Control **actions**, not just prompts | Intercept layer on `action` + `context`, not chat-only |
| **Human-in-the-loop** when it matters | Verification queue + `awaitVerification` in agents |
| **Your** model stack | Ollama, OpenAI, Groq, LiteLLM, vLLM — or no LLM at all |
| Unlimited product surface | Register any action name; YAML import/export |
| Compliance-friendly logs | Plain-English `humanRecord` on every decision |
| Integrations | Webhooks, REST API, optional Supabase audit mirror |
| Adoption-friendly OSS | MIT, local-first, no account required to try |

---

## Features (open source)

| Area | What you can do |
|------|-----------------|
| **Action verification** | `POST /v1/actions/verify` — gate tool calls, APIs, robotics commands, MCP tools |
| **Sanctum Shield** | Behavioral detection: 8 signal categories, custom operator rules (action glob · financial threshold · BLOCK/REQUIRE_VERIFICATION/LOG_ONLY), per-org 30s rule cache |
| **Agent fleet management** | Register agents, rotate tokens (immediate invalidation), per-agent threat summary (24h blocked/held/approved, worst Shield level), activity drill-down, time-bounded grants, Download .env |
| **Zero-install connections** | Agents connect via direct HTTP (`X-Agent-Token`); no SDK required. Mobile agents, browser agents, scripts — same API |
| **Policies** | Unlimited actions; approve / verify / block; org keys (`acme:payroll`); `riskPrompt` per action; YAML import/export |
| **Risk models** | **Ollama** (Qwen, Llama, Mistral, …), **OpenAI-compatible** APIs, or heuristics-only |
| **Blast-radius scoring** | 0-100 score: reversibility, data sensitivity, physical-world, external destination, monetary value; score floors for critical/high-blast actions |
| **Source-trust classification** | 7 levels including `untrusted_content` and `tool_output` — deterministic indirect-prompt-injection defense |
| **Signed action tokens** | HMAC-SHA256, 5 min TTL, scoped to actor + action + org + audit id; executor-side verification |
| **Dual approver + auto-escalate** | `requireSecondApprover`; stale verifications auto-escalate after policy-defined minutes; push re-notifications |
| **Fleet kill switch** | One-click org-wide pause; mobile-accessible; resumes cleanly |
| **Audit** | Local JSONL + optional Supabase mirror; narrative context (`heard`, `intent`); execution receipts |
| **Webhooks** | `verification.required`, `action.blocked`, `verification.resolved`, `shield.containment`; dead-letter at `GET /v1/webhooks/dead` |
| **Policy replay** | *"If today's policies had existed yesterday, what would have changed?"* |
| **SOC2 + NIST AI RMF evidence** | 16 mapped controls; downloadable JSON for auditors |
| **Domain marketplace** | Healthcare PHI, finance transfers, ROS2 safety, MCP baseline, Claude Desktop policy packs |
| **SDKs** | TypeScript (`@sanctum-runtime/sdk`) · Python (`sanctum-runtime`) · 16 framework adapters · CLI (11 commands) |
| **Deployment** | Self-host: `npm run dev:api`, Docker (`docker build -t sanctum/runtime .`), Render, Kubernetes (Helm in `deploy/`) |
| **Dashboard** | Multi-org, agent drill-down, Shield rules editor, compliance export, fleet map, billing |

## What makes Sanctum the trust infrastructure, not just a gate

Most tools stop at "approve or block." Sanctum goes further:

- **Detection before the fact** — Shield scores behavioral signals before the policy engine runs. A critical-blast action from an untrusted source is flagged and contained even if policy says "approve."
- **Operator-defined threat rules** — your team encodes your threat model in plain rules (action patterns, dollar thresholds, custom conditions). No model fine-tuning required.
- **Fleet-level visibility** — per-agent threat summaries give operators a live picture of which agents are acting suspiciously, not just a firehose of action events.
- **Token lifecycle** — rotation with immediate invalidation means a compromised agent credential is revoked in seconds, not at next deploy.
- **Time-bounded approvals** — grant an agent permission for a specific action for 30 minutes. Stops the interrupt loop without permanently widening the policy.
- **Signed proof of authorization** — the `actionToken` is a cryptographic receipt executors must verify. Side effects cannot run without it.
- **Full execution loop** — agents report back succeeded/failed/skipped. The audit record covers the whole action lifecycle, not just the decision.

**Full API + SDK reference:** [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

---

## Install

**npm / TypeScript:**

| Package | Install | Role |
|---------|---------|------|
| [`@sanctum-runtime/sdk`](./packages/sdk) | `npm i @sanctum-runtime/sdk` | Core client — verify, policies, audit |
| [`@sanctum-runtime/adapters`](./packages/adapters) | `npm i @sanctum-runtime/adapters` | 16 framework adapters (LangChain, MCP, OpenAI Agents, …) |
| [`@sanctum-runtime/adapter-agent-runtime`](./packages/adapters/agent-runtime) | `npm i @sanctum-runtime/adapter-agent-runtime` | `protectAgent()` one-line agent wrapper |
| [`@sanctum-runtime/cli`](./packages/cli) | `npm i -g @sanctum-runtime/cli` | CLI: `sanctum verify`, `agents rotate`, `shield events`, … |

**Python:**

```bash
pip install sanctum-runtime
```

**Docker:**

```bash
docker build -t sanctum/runtime .
docker run -p 3001:3001 --env-file .env sanctum/runtime
```

---

## Configuration (`.env`)

Copy [`.env.example`](./.env.example). Nothing is hardcoded to localhost in source — you set hosts and ports.

| Variable | Purpose |
|----------|---------|
| `SANCTUM_API_URL` / `HOST`+`PORT` | Runtime API |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Local LLM risk scoring |
| `SANCTUM_RISK_PROVIDER` | `ollama` · `openai` · `none` |
| `SANCTUM_WEBHOOK_URL` | Notify your app on verify/block |
| `SANCTUM_API_KEY` | Lock down the API |
| `DASHBOARD_*` | Operator UI (optional) |

Local models: [local-ai/MODELS.md](./local-ai/MODELS.md) · Production: [HOSTED.md](./HOSTED.md)

---

## Monorepo map

| Path | What it is |
|------|------------|
| [`apps/api`](./apps/api) | HTTP runtime API |
| [`apps/dashboard`](./apps/dashboard) | Community control plane |
| [`packages/sdk`](./packages/sdk) | Published SDK |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy → risk → audit pipeline |
| [`packages/policy-engine`](./packages/policy-engine) | Policies + YAML |
| [`services/risk-model`](./services/risk-model) | Pluggable model providers |
| [`examples/`](./examples/) | Agent + npm consumer samples |
| [`examples/policies.example.yaml`](./examples/policies.example.yaml) | Sample policies |

Fleet orchestration, managed cloud, and proprietary threat intel stay **enterprise** — [OPEN_CORE.md](./OPEN_CORE.md).

---

## Documentation

| Doc | When to read |
|-----|----------------|
| [START_HERE.md](./START_HERE.md) | Clone, run, first verify |
| [CATEGORIES.md](./CATEGORIES.md) | **12 categories** — robots, smart home, industrial, agents, … |
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Every endpoint, SDK method, webhook, env var |
| [OPEN_CORE.md](./OPEN_CORE.md) | Public vs private roadmap |
| [HOSTED.md](./HOSTED.md) | Deploy on your servers |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Contribute to the monorepo |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Issues & PRs |
| [.github/GITHUB_DISCOVERY.md](./.github/GITHUB_DISCOVERY.md) | Repo topics & GitHub About (maintainers) |

---

## Frequently searched problems (does Sanctum fit?)

| You are looking for… | Sanctum approach |
|----------------------|------------------|
| AI agent **security** / **safety** layer | Runtime middleware on actions, not chat-only |
| **Tool use** / **function calling** guardrails | Verify each tool invocation with policy |
| **Human in the loop** for agents | `REQUIRE_VERIFICATION` + dashboard or API resolve |
| **LLM guardrails** for physical / financial actions | Heuristic floors + optional model scoring |
| **Ollama** agent with safety | `OLLAMA_URL` + policies; see [MODELS.md](./local-ai/MODELS.md) |
| **Audit log** for AI decisions | `humanRecord` + export; optional Supabase |
| **Policy as code** | YAML import/export, unlimited action keys |
| **Self-hosted** AI governance | MIT, Docker-friendly API, no vendor lock-in for OSS |
| **Robotics** / **smart home** / **industrial** | Same `action` + `context` — see [CATEGORIES.md](./CATEGORIES.md) |
| **Humanoid** / **embodied** command safety | `unlock_door`, `move_robot`, custom motion policies |

If this matches your search, **star the repo** and open an issue with your stack — we are optimizing for real agent builders.

---

## Community & license

- **Issues:** [github.com/Matik103/sanctum-runtime/issues](https://github.com/Matik103/sanctum-runtime/issues)  
- **Enterprise / design partners:** [early access template](.github/ISSUE_TEMPLATE/early-access.md)  
- **License:** [MIT](./LICENSE) — use in commercial products; enterprise features are a separate track.

**Keywords (for search):** AI agent runtime, robotics safety, smart home AI, industrial automation gate, humanoid robot policy, embodied AI security, LLM tool use, ROS2 action verification, autonomous systems, human-in-the-loop, Ollama guardrails, open source AI governance.

Enterprise fleet and hosted control plane are a **separate track** — [OPEN_CORE.md](./OPEN_CORE.md).
