# Start here (developers)

**Sanctum Runtime** (MIT) is an **action gate for autonomous systems**: agents, robots, smart home, industrial lines, and workflows. Same API — verify side effects *before* they run, with policies, human approval, models, and audit logs.

**Not agents-only:** [CATEGORIES.md](./CATEGORIES.md) lists all 12 supported segments and example actions.

Clone this repo, point the SDK at your API, and gate actions in minutes. No hosted account required.

**Full reference (API, SDK, policies, models, webhooks, dashboard):** [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)  
**GitHub topics & About text:** [.github/GITHUB_DISCOVERY.md](./.github/GITHUB_DISCOVERY.md)

## 1. Configure

```bash
cp .env.example .env
# Edit .env — set HOST, PORT, DASHBOARD_*, SITE_*, OLLAMA_URL for your machine
```

See [`.env.example`](./.env.example) for every variable.

## 2. Run

**Run all commands from the repo root** (`sanctum-runtime/`, where `package.json` lives).  
If you see `ENOENT ... package.json` in your home folder, run `cd` into the clone first.

### API + SDK only (no dashboard, no Supabase)

```bash
npm install
npm run dev:api          # API at http://127.0.0.1:3001
npm run smoke            # in another terminal
npm run example:agent
```

### Full stack (API + dashboard UI)

```bash
npm install
npm run dev:runtime      # API + dashboard
npm run smoke
npm run example:agent
```

Optional: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for dashboard login (not required for OSS).

**npm-only app** (after packages are on npm):

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
export SANCTUM_API_URL=http://127.0.0.1:3001   # your API from .env
node examples/npm-consumer/run.mjs             # from a clone, or copy run.mjs into your app
```

- **Dashboard UI:** `http://127.0.0.1:5174` (from `DASHBOARD_*` in `.env`) — mission control  
- **API only (JSON):** `http://127.0.0.1:3001` — not the dashboard; use `/health` to probe the API  

If the dashboard shows blank / MIME errors, stop dev servers, run `rm -rf apps/dashboard/node_modules/.vite`, then `npm run dev:runtime` again and hard-refresh the browser.

## What is open source here?

| Path | What it is |
|------|------------|
| [`packages/sdk`](./packages/sdk) | `@sanctum-runtime/sdk` — embed in your agent or backend |
| [`packages/adapters/agent-runtime`](./packages/adapters/agent-runtime) | `protectAgent()` — verify before execute |
| [`apps/api`](./apps/api) | Runtime API server |
| [`apps/dashboard`](./apps/dashboard) | Community control plane UI |
| [`packages/runtime-engine`](./packages/runtime-engine) | Policy + risk + audit pipeline |
| [`examples/`](./examples/) | Runnable samples |

**Not in this repo (enterprise / private):** fleet orchestration, hosted cloud, proprietary threat intelligence — [OPEN_CORE.md](./OPEN_CORE.md).

## Embed in your project

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

// Pass your API URL (from .env SANCTUM_API_URL, or explicit in production)
const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

await protectAgent(sanctum, {
  actor: 'my-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'user@example.com' },
  offlineMode: true,
  execute: async () => sendEmail(),
})
```

Or use `sanctum.middleware()` directly. In Node, the SDK reads `SANCTUM_API_URL` when `baseUrl` is omitted.

## Configuration reference

| Variable | Required? | Used by |
|----------|-----------|---------|
| `HOST` + `PORT` or `SANCTUM_API_URL` | **Yes** | API, SDK, smoke tests |
| `OLLAMA_URL` + `OLLAMA_MODEL` | Recommended | Online risk scoring (offline still works) |
| `DASHBOARD_*` | Only for UI | `npm run dev:runtime` / dashboard |
| `SITE_*` | Only for marketing site | `npm run dev` |
| `SANCTUM_API_KEY` | Optional | Lock down API; scripts send it automatically |
| `SUPABASE_*` | Optional | Dashboard login + audit mirror |
| `SANCTUM_RISK_PROVIDER` | No | `ollama` \| `openai` \| `none` |
| `SANCTUM_WEBHOOK_URL` | No | Webhooks on verify/block/resolve |

## Developer readiness checklist

Before you ship or move to the next product stage, confirm:

- [ ] `npm run build:sdk` succeeds
- [ ] `npm run dev:api` → `curl http://127.0.0.1:3001/health` returns `"ok": true`
- [ ] `npm run smoke` — all checks pass
- [ ] `npm run example:agent` completes
- [ ] Your app: `npm install @sanctum-runtime/sdk` + `baseUrl` to your API
- [ ] (Optional) Ollama running for online model path
- [ ] (Optional) Dashboard at `DASHBOARD_URL` for operators
- [ ] (Optional) [HOSTED.md](./HOSTED.md) if deploying API to your infra
- [ ] `awaitVerification` on `protectAgent` if operators approve in dashboard

## Your model, your policies (adoption)

Sanctum is designed so **you** bring the stack — not the other way around.

### Risk model (pick one)

| Provider | `.env` | Use when |
|----------|--------|----------|
| **Ollama** (default local) | `OLLAMA_URL` + `OLLAMA_MODEL` | Any GGUF model you pull (`llama3`, `mistral`, `qwen2.5-3b-instruct`, …) |
| **OpenAI-compatible** | `SANCTUM_RISK_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | OpenAI, vLLM, LiteLLM, Groq, Together, local gateways |
| **None** | `SANCTUM_RISK_PROVIDER=none` | Policy + heuristics only (no LLM calls) |

Set `SANCTUM_RISK_MODEL` to override the model name for either provider. See [local-ai/MODELS.md](./local-ai/MODELS.md) for local weight setup.

### Unlimited action policies

Register **any** action name — there is no fixed catalog:

```ts
await sanctum.registerPolicy('deploy_model', 'verify')
await sanctum.registerPolicy('acme:wire_transfer', 'block')
await sanctum.registerPolicy('read_calendar', {
  requiresVerification: false,
  blockWhenOffline: true,
  allowedActors: ['scheduler-bot'],
})
```

- **API:** `POST /v1/policies`, `PATCH /v1/policies/:action`, `DELETE /v1/policies/:action`
- **Dashboard:** Policies → **Add policy**
- **Org scope:** pass `org_id` in context; use keys like `acme:unlock_door`

Unknown actions still run with a permissive default until you define a policy.

### Custom risk prompts (per action)

```ts
await sanctum.registerPolicy('unlock_door', {
  requiresVerification: true,
  riskPrompt: 'Treat night-time access while owner is asleep as high risk.',
})
```

The runtime passes `riskPrompt` to your configured risk model when scoring that action.

### Policy YAML import / export

```bash
curl -H "X-Sanctum-Key: $SANCTUM_API_KEY" http://127.0.0.1:3001/v1/policies/export.yaml
```

```ts
await sanctum.importPoliciesYaml(await fs.readFile('policies.yaml', 'utf8'))
```

Example file: [examples/policies.example.yaml](./examples/policies.example.yaml). Dashboard: Policies → **Export YAML** / **Import YAML**.

### Webhooks (verify / block / resolve)

```bash
SANCTUM_WEBHOOK_URL=https://your-app.com/sanctum/events
# optional: SANCTUM_WEBHOOK_SECRET=...  → X-Sanctum-Signature: sha256=...
```

Events: `verification.required`, `action.blocked`, `verification.resolved`. Payload: `{ event, timestamp, entry }` (full audit entry).

## Verification resume (agents)

```ts
await protectAgent(sanctum, {
  correlationId: 'run-123',
  action: 'unlock_door',
  context: { heard: 'Open the door' },
  awaitVerification: { timeoutMs: 120_000 },
  execute: async () => { /* runs after dashboard approve */ },
})
```

Or poll: `sanctum.waitForVerification('run-123')` after `REQUIRE_VERIFICATION`.

## More

- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — **complete OSS capabilities reference**
- [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise
- [HOSTED.md](./HOSTED.md) — production self-host
- [DEVELOPMENT.md](./DEVELOPMENT.md) — monorepo map
- [local-ai/MODELS.md](./local-ai/MODELS.md) — local model setup
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [.github/GITHUB_DISCOVERY.md](./.github/GITHUB_DISCOVERY.md) — GitHub About + topics (maintainers)
