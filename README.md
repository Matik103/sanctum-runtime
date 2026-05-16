# Sanctum Runtime

**The open-source gate between autonomous AI and the real world.**  
One runtime for **agents, robots, smart home, industrial systems, and workflows** — verify every action *before* it runs, with policies, human approval, local or cloud LLMs, and audit logs developers actually want to read.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![npm @sanctum-runtime/sdk](https://img.shields.io/npm/v/@sanctum-runtime/sdk?label=npm%20sdk)](https://www.npmjs.com/package/@sanctum-runtime/sdk)
[![GitHub stars](https://img.shields.io/github/stars/Matik103/sanctum-runtime?style=social)](https://github.com/Matik103/sanctum-runtime)

**About this repo:** Open-source trust layer for autonomous AI — gate agent, robot, smart home, and industrial actions before they run. Policies, HITL, Ollama/OpenAI, audit. MIT · `npm install @sanctum-runtime/sdk`

| | |
|---|---|
| **Start** | [START_HERE.md](./START_HERE.md) · [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) · [Sanctum vs guardrails](./DEVELOPER_GUIDE.md#sanctum-vs-guardrails) · [CATEGORIES.md](./CATEGORIES.md) |
| **Production** | [PRODUCTION_OPS.md](./PRODUCTION_OPS.md) · [RENDER.md](./RENDER.md) · [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) |
| **Install** | `npm install @sanctum-runtime/sdk` · [adapter](https://www.npmjs.com/package/@sanctum-runtime/adapter-agent-runtime) |
| **Help** | [SUPPORT.md](./SUPPORT.md) · [Issues](https://github.com/Matik103/sanctum-runtime/issues) · [Discussions](https://github.com/Matik103/sanctum-runtime/discussions) |
| **Scope** | [OPEN_CORE.md](./OPEN_CORE.md) (OSS vs enterprise) |

---

## Who this is for

You are building **AI agents**, **LLM apps**, **workflow automation**, or **robotics software** and you need a real answer to:

> *“What happens when the model tries to unlock a door, send email, charge a card, or call production?”*

Sanctum is for:

- **Agent builders** — LangChain, CrewAI, custom Node/Python agents, MCP servers, “agentic” SaaS  
- **Platform engineers** — gate **function calling / tool use** with approve · verify · block  
- **Security-minded teams** — policy engine + audit trail without locking yourself into a black box  
- **Local-first devs** — **Ollama**, GGUF, vLLM, or OpenAI-compatible APIs for risk scoring  
- **Operators** — optional dashboard for human-in-the-loop (HITL) review  

If you only need chat guardrails, look at prompt filters. If you need **execution control**, you are in the right place.

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
| **Action verification** | `POST /v1/actions/verify` — gate tool calls, APIs, robotics commands |
| **Policies** | Unlimited actions; approve / verify / block; org keys (`acme:payroll`); `riskPrompt` per action |
| **Risk models** | **Ollama** (Qwen, Llama, Mistral, …), **OpenAI-compatible** APIs, or heuristics-only |
| **Agent SDK** | `verifyAction`, `middleware()`, `protectAgent()`, `waitForVerification()` |
| **Audit** | Local JSONL; narrative context (`heard`, `intent`); optional Postgres via Supabase |
| **Webhooks** | `verification.required`, `action.blocked`, `verification.resolved` |
| **Dashboard** | Policies, live activity, review queue (optional) |
| **CI** | GitHub Actions runs build + smoke on every PR |

**Full list:** [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

---

## npm packages

| Package | Install | Role |
|---------|---------|------|
| [`@sanctum-runtime/sdk`](./packages/sdk) | `npm i @sanctum-runtime/sdk` | Core client — verify, policies, audit |
| [`@sanctum-runtime/adapter-agent-runtime`](./packages/adapters/agent-runtime) | `npm i @sanctum-runtime/adapter-agent-runtime` | `protectAgent()` helper |

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
