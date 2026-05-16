# Developer guide — everything you can do (OSS)

**Sanctum Runtime** is open-source middleware for **AI agents**, **LLM tool use**, and **automation**: every meaningful action passes through policy checks, optional **Ollama** or **OpenAI-compatible** risk scoring, then **approve · verify · block**, with an audit trail operators can read.

If you are building agent frameworks, MCP tools, robotics commands, or backend workflows — this is the full OSS surface (API, SDK, policies, webhooks, dashboard).

| Start here | Purpose |
|------------|---------|
| [START_HERE.md](./START_HERE.md) | First run (clone, `.env`, smoke) |
| [`.env.example`](./.env.example) | All environment variables |
| [OPEN_CORE.md](./OPEN_CORE.md) | OSS vs enterprise boundary |
| [HOSTED.md](./HOSTED.md) | Self-host API in production |
| [local-ai/MODELS.md](./local-ai/MODELS.md) | Local Ollama / GGUF setup |
| [examples/policies.example.yaml](./examples/policies.example.yaml) | Sample policies for YAML import |
| [CATEGORIES.md](./CATEGORIES.md) | 12 categories (agents, robotics, smart home, …) |

---

## Sanctum vs guardrails

### What guardrails usually mean

In 2024–2026 “AI guardrails” most often refers to **content safety** on the LLM boundary:

- Block jailbreaks, toxicity, and policy violations in **user prompts** and **model outputs**
- PII detection, topic restrictions, structured JSON / schema validation
- Vendors and libraries: moderation APIs, **NeMo Guardrails**, **Guardrails AI**, **Llama Guard**, cloud “prompt shields,” etc.

That stack is **necessary** for customer-facing chat and copilots. It does **not** replace a gate on **execution**: *unlock door*, *transfer funds*, *delete production data*, *run shell command*.

### What Sanctum adds (action layer)

Sanctum is **middleware on actions**, not chat tokens:

| Capability | Sanctum OSS |
|------------|-------------|
| Evaluate `action` + `context` before side effects | `POST /v1/actions/verify`, SDK `verifyAction()` |
| Per-action policies (unlimited names) | `POST /v1/policies`, YAML import/export, `riskPrompt` |
| Human-in-the-loop | `REQUIRE_VERIFICATION` → dashboard or API resolve → `GET /v1/verifications/:correlationId` |
| Integrate with your ops stack | Webhooks + optional Supabase audit mirror |
| Risk scoring | Ollama, OpenAI-compatible APIs, or heuristics-only (`SANCTUM_OFFLINE_MODE`) |
| Agent convenience | `protectAgent()`, `waitForVerification()` |

```text
  guardrails (chat)     →  safe language
  Sanctum (actions)     →  safe execution
```

### Comparison table

| Question | Content guardrails | Sanctum Runtime |
|----------|-------------------|-----------------|
| Stops harmful **text**? | Primary focus | No (use moderation alongside) |
| Stops harmful **tool / API / robot** calls? | Indirect (prompts, coarse allowlists) | **Primary focus** |
| Human approval with resume? | Rarely built-in | Yes (`correlationId`, resolve, webhooks) |
| Audit trail for compliance? | Often trace-only | `humanRecord` + audit API + webhooks |
| Works without a cloud LLM? | Varies | Yes (policies + offline heuristics) |
| Self-host, MIT OSS? | Varies | Yes |

### When developers need Sanctum

| Importance | Use case |
|------------|----------|
| **Essential** | Agents with privileged tools, robotics / physical access, payments, healthcare, infra automation |
| **High** | Platform teams standardizing “verify before execute” across products |
| **Medium** | Internal copilots that can run terminal, delete files, or call admin APIs |
| **Lower** | Read-only chat with no tools (guardrails may suffice) |

### Recommended stack

1. **Input/output guardrails** on the model (your existing vendor or OSS choice).
2. **Sanctum** immediately before calling external systems, databases, devices, or privileged APIs.
3. **Webhooks** (`SANCTUM_WEBHOOK_URL`) into Slack, PagerDuty, or your approval UI when `verification.required` fires.

```ts
// Pattern: guardrails on messages; Sanctum on execution
const reply = await model.chat(userMessage) // + your content guardrails

await sanctum.verifyAction({
  actor: 'billing-agent',
  action: 'transfer_funds',
  context: { amount: 50000, currency: 'USD', destination: acct },
  offlineMode: false,
})
// only call transfer() if APPROVED or after human resolve
```

### Production checklist

| Item | Notes |
|------|--------|
| Deploy API | [HOSTED.md](./HOSTED.md), [RENDER.md](./RENDER.md) — set `SANCTUM_API_KEY` |
| Persistence | Render free disk is ephemeral; use Supabase mirror or your DB for long-lived audit |
| Webhooks | Point `SANCTUM_WEBHOOK_URL` at your app (not a test inbox) |
| Uptime | Paid plan or self-host if cold starts are unacceptable |
| Secrets | Rotate `SANCTUM_API_KEY` and `SANCTUM_WEBHOOK_SECRET` regularly |

**Positioning line:** *Content guardrails keep the model polite; Sanctum keeps the agent from doing the wrong thing in the real world.*

---

## Minimum path (5 minutes)

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
cp .env.example .env
npm install
npm run dev:api          # terminal 1
npm run smoke            # terminal 2
```

Embed in your app:

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await protectAgent(sanctum, {
  actor: 'my-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'user@example.com' },
  execute: async () => sendEmail(),
})
```

---

## Runtime API (HTTP)

Base URL: `SANCTUM_API_URL` or `http://HOST:PORT` from `.env`.

Auth (when configured): `X-Sanctum-Key: …` or `Authorization: Bearer <Supabase JWT>`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness (`ok`, `ollama`, policy/audit counts) |
| `GET` | `/v1/status` | Runtime + risk model + policy stats |
| `POST` | `/v1/actions/verify` | Gate an action → decision + audit entry |
| `GET` | `/v1/audit` | List audit log (`?limit=`, `?org_id=`) |
| `POST` | `/v1/audit/:id/resolve` | Approve/deny a pending verification |
| `GET` | `/v1/verifications/:correlationId` | Poll verification state (`pending` / `approved` / `blocked`) |
| `GET` | `/v1/policies` | All policies |
| `POST` | `/v1/policies` | Create/register policy for any action name |
| `PATCH` | `/v1/policies/:action` | Update policy |
| `DELETE` | `/v1/policies/:action` | Remove policy |
| `GET` | `/v1/policies/export.yaml` | Export policies as YAML |
| `POST` | `/v1/policies/import.yaml` | Import YAML `{ yaml, merge? }` |
| `GET` | `/v1/orgs/:orgId/policies` | Org-scoped policy view |
| `GET` | `/v1/webhooks/status` | Webhook config summary |
| `POST` | `/analyze-action` | Legacy analyze alias (same as verify) |

### Verify request body

```json
{
  "actor": "agent-1",
  "action": "unlock_door",
  "context": {
    "heard": "Open the front door",
    "time": "02:13 AM",
    "owner_sleeping": true,
    "org_id": "acme"
  },
  "offlineMode": false,
  "correlationId": "run-42"
}
```

### Decisions

| Decision | Meaning |
|----------|---------|
| `APPROVED` | Safe to execute |
| `REQUIRE_VERIFICATION` | Pause — operator approves in dashboard or via resolve API |
| `BLOCKED` | Deny execution |

---

## SDK (`@sanctum-runtime/sdk`)

```ts
const sanctum = new SanctumRuntime({
  baseUrl: 'http://127.0.0.1:3001',
  apiKey: process.env.SANCTUM_API_KEY,      // optional
  getAccessToken: async () => jwtOrNull,    // optional Supabase
})
```

| Method | Purpose |
|--------|---------|
| `verifyAction(request, { offlineMode?, correlationId? })` | Gate one action |
| `policy(action, 'approve' \| 'verify' \| 'block')` | Set policy mode |
| `registerPolicy(action, mode \| partialPolicy)` | Create any action policy |
| `deletePolicy(action)` | Remove policy |
| `getPolicies()` | Fetch all policies |
| `exportPoliciesYaml()` | Download YAML string |
| `importPoliciesYaml(yaml, merge?)` | Import from YAML |
| `getAudit(limit?)` | Audit entries |
| `resolveAuditEntry(id, { decision, resolvedBy?, note? })` | Operator resolve |
| `getVerificationStatus(correlationId)` | Single poll |
| `waitForVerification(correlationId, { timeoutMs?, pollIntervalMs? })` | Poll until done |
| `getStatus()` | Runtime status |
| `getWebhookStatus()` | Webhook config |
| `middleware()` | `agent.use(sanctum.middleware())` pattern |
| `runtime().attach(host)` | Robotics-style attach hook |

### Agent adapter (`@sanctum-runtime/adapter-agent-runtime`)

```ts
await protectAgent(sanctum, {
  action: 'unlock_door',
  context: { heard: 'Open the door' },
  correlationId: 'run-123',
  awaitVerification: { timeoutMs: 120_000 },  // wait for dashboard approve
  execute: async () => unlock(),
})
```

---

## Policies (unlimited actions)

Each policy is keyed by **action name** (any string). Optional org prefix: `acme:wire_transfer` with `org_id` in verify `context`.

| Field | Type | Effect |
|-------|------|--------|
| `requiresVerification` | boolean | Force human review when otherwise approved |
| `autoBlock` | boolean | Always block |
| `blockWhenOffline` | boolean | Block when heuristics-only / no model |
| `allowedActors` | string[] | Allowlist of `actor` values |
| `riskPrompt` | string | Custom instructions for risk model on this action |

**Modes (SDK shorthand):**

| Mode | Maps to |
|------|---------|
| `approve` | No verify, no block |
| `verify` | `requiresVerification: true` |
| `block` | `autoBlock: true` |

Unknown actions use a permissive default until you register a policy.

---

## Risk model (your choice)

| Provider | Environment | Notes |
|----------|-------------|-------|
| **Ollama** | `OLLAMA_URL`, `OLLAMA_MODEL` | Any local model (`qwen2.5-3b-instruct`, `llama3.2`, …) |
| **OpenAI-compatible** | `SANCTUM_RISK_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI, vLLM, LiteLLM, Groq, Together |
| **None** | `SANCTUM_RISK_PROVIDER=none` | Policy + heuristics only |

Override model name: `SANCTUM_RISK_MODEL`.

Heuristic floors still apply (e.g. physical-access actions are not under-rated by small models).

---

## Webhooks

```bash
SANCTUM_WEBHOOK_URL=https://your-app.com/sanctum/events
SANCTUM_WEBHOOK_SECRET=optional-signing-secret
SANCTUM_WEBHOOK_EVENTS=verification.required,action.blocked,verification.resolved
```

| Event | When fired |
|-------|------------|
| `verification.required` | Decision `REQUIRE_VERIFICATION` |
| `action.blocked` | Decision `BLOCKED` |
| `verification.resolved` | After operator/API resolve |

Payload: `{ "event", "timestamp", "entry" }` where `entry` is the full audit record.  
Optional header: `X-Sanctum-Signature: sha256=<hmac>` when `SANCTUM_WEBHOOK_SECRET` is set.

---

## Audit & narrative context

Pass human-readable context for compliance-style logs:

| Context key | Use |
|-------------|-----|
| `heard`, `user_said`, `spoken_command` | What was said |
| `intent`, `goal` | Stated purpose |
| `prompt`, `instruction` | Prompt / injection text |
| `channel`, `source` | `voice`, `api`, etc. |

Each entry includes `humanRecord` (plain English) and optional `humanResolution` after approve/deny.

**Storage:** local `data/audit.jsonl`. Optional mirror to Supabase `audit_events` when `SUPABASE_*` is set — [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

---

## Dashboard (optional)

`npm run dev:runtime` → `DASHBOARD_URL` (default `http://127.0.0.1:5174`)

| Page | What you can do |
|------|-----------------|
| Overview | Live status, policy count, model connection |
| Policies | Add/remove actions, approve/verify/block, **Export/Import YAML** |
| Activity / Audit | Browse and inspect entries |
| Review queue | Approve/deny `REQUIRE_VERIFICATION` |
| Settings | Runtime + risk model status |

Not required for SDK/API integration.

---

## Scripts & CI

| Command | Purpose |
|---------|---------|
| `npm run dev:api` | API only |
| `npm run dev:dashboard` | Dashboard only |
| `npm run dev:runtime` | API + dashboard |
| `npm run smoke` | Full integration smoke test |
| `npm run example:agent` | Minimal agent gate example |
| `npm run example:npm` | External npm consumer check |
| `npm run build:sdk` | Build publishable SDK |
| `npm run build:packages` | SDK + adapter |

GitHub Actions: [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — build + smoke on PRs.

---

## Environment variables (complete)

| Variable | Required | Purpose |
|----------|----------|---------|
| `HOST`, `PORT` or `SANCTUM_API_URL` | **Yes** | API listen / client URL |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Recommended | Local risk model |
| `SANCTUM_RISK_PROVIDER` | No | `ollama` \| `openai` \| `none` |
| `SANCTUM_RISK_MODEL` | No | Override model name |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | If openai | Cloud / gateway model |
| `SANCTUM_OFFLINE_MODE` | No | Force heuristics-only globally |
| `SANCTUM_API_KEY` | No | Lock API (`X-Sanctum-Key`) |
| `SANCTUM_WEBHOOK_URL` / `SANCTUM_WEBHOOK_URLS` | No | Webhook targets |
| `SANCTUM_WEBHOOK_SECRET` | No | HMAC signature |
| `SANCTUM_WEBHOOK_EVENTS` | No | Filter events |
| `DASHBOARD_*` | For UI | Dashboard dev server |
| `SITE_*` | For site | Marketing/docs site |
| `SUPABASE_*` | Optional | Auth + audit mirror |

---

## Enterprise (not in this repo)

Fleet orchestration, managed Sanctum Cloud, proprietary threat intel, SIEM packs, webhook DLQ/retry, compliance attestation — [OPEN_CORE.md](./OPEN_CORE.md).

Early access: [GitHub issue template](https://github.com/Matik103/sanctum-runtime/issues/new?template=early-access.md).

---

## Related searches (index)

This guide is meant to answer lookups like: **AI agent security**, **Sanctum vs guardrails**, **action authorization for LLM agents**, **robotics action safety**, **smart home AI control**, **industrial automation gate**, **humanoid command policy**, **LLM tool use**, **ROS2 verification**, **human-in-the-loop**, **Ollama guardrails**, **AI audit log**, **self-hosted governance**, **open source autonomous runtime**. Category examples: [CATEGORIES.md](./CATEGORIES.md).
