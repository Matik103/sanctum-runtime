# Development reference

Use this file as the **entry point** for how we build Sanctum in this repository.

## Canonical spec

| Artifact | Role |
|----------|------|
| **[`PRD.md`](./PRD.md)** | Single source of truth: MVP (**§5**), surfaces (**§6**), Supabase (**§7**), open-core vs private intelligence (**§4.3**, public docs **§6.3**), defensibility (**§4.4**), market map (**§4.5**), adapters (**§17**), verification (**§18**). |
| **[`.cursor/rules/prd-alignment.mdc`](./.cursor/rules/prd-alignment.mdc)** | Cursor **always-on** rule: map work to PRD sections; no silent scope drift; respect Supabase and open-core boundaries. |

## Before you ship a feature

1. Cite the **PRD section(s)** your change satisfies (e.g. §5.1 action verification, §7 Supabase).
2. If the change is **out of MVP or roadmap** unless the PRD is updated, **update `PRD.md` first** or split an intentional follow-up.

## Quick navigation (`PRD.md`)

- **§4.5** — Market map and positioning (autonomous AI systems, not humanoids-only)  
- **§4.6** — Developer access: SDK in-process (primary), optional daemon, dashboard as control plane only  
- **§4.3** — Open core vs private intelligence layer (what to open-source, what stays enterprise)  
- **§4.3.3 / §6.3** — Public documentation structure (`/docs`)  
- **§4.4** — Defensibility and competitive strategy  
- **§17** — Category expansion via adapters (do not build 12 products)  
- **§5** — MVP only (action verification, behavioral monitoring, offline, audit logs)  
- **§7** — External Supabase (auth, Postgres, RLS, realtime)  
- **§13** — Week 1–3 engineering sequence  
- **§18** — Feature verification + Cursor enforcement  

Do not treat messaging or stack choices as informal — if it affects product behavior or positioning, it belongs in **`PRD.md`**.

## Phase 1 runtime (PRD §5)

Monorepo layout:

```text
apps/api              — Fastify runtime API (HOST:PORT from .env)
apps/dashboard        — Trust dashboard UI (DASHBOARD_* from .env)
packages/sdk          — npm `@sanctum-runtime/sdk` (SanctumClient / SanctumRuntime / middleware)
packages/runtime-engine — Intercept → policy → risk → audit
packages/policy-engine
packages/audit-system
packages/adapters/agent-runtime — Category 1 adapter (PRD §17)
services/ollama-bridge — Local Qwen risk analysis
```

**Agent adapter (verify before execute):**

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'
import { protectAgent, AgentActions } from '@sanctum-runtime/adapter-agent-runtime'

const sanctum = new SanctumRuntime()
await protectAgent(sanctum, {
  actor: 'workflow-agent',
  action: AgentActions.SEND_EMAIL,
  context: { to: 'customer@example.com' },
  execute: async () => sendMail(...),
})
```

**Configure first** (required — no hardcoded hosts/ports in code):

```bash
cp .env.example .env
# Edit HOST, PORT, DASHBOARD_*, OLLAMA_URL, SITE_* for your environment
```

**Start the runtime stack** (API + dashboard; keep Ollama running for online risk calls):

```bash
npm run dev:runtime
```

Or separately:

```bash
npm run dev:api        # listens on HOST:PORT from .env
npm run dev:dashboard  # DASHBOARD_HOST:DASHBOARD_PORT from .env
```

**SDK:** `new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL })` — or pass `baseUrl` explicitly. Node scripts read `.env` via `scripts/env.ts`.

**Integration flow:** Wire the SDK or call the API from your agent. Events appear on the dashboard Overview and in the audit log. Run `npm run example:agent` for a minimal offline gate example, or `npm run smoke` for a CI health check.

**Human-readable audit records:** Pass narrative context on each `verifyAction` so compliance logs read like plain English (inspired by audit UIs in *Humans*):

| Field | Purpose |
|-------|---------|
| `heard`, `trigger_phrase`, `spoken_command`, `user_said` | What the agent was told (voice/chat) |
| `prompt`, `instruction`, `injection_phrase` | Text used in prompt-injection attempts |
| `intent`, `stated_intent`, `goal` | Why the agent says it is acting |
| `channel`, `source` | e.g. `voice`, `sms`, `api` |

The runtime stores a `humanRecord` on each audit entry; the dashboard renders it in **Audit logs** and exports.

**OSS adoption:** See [OPEN_CORE.md](./OPEN_CORE.md) for public vs enterprise boundaries.

**API (examples):**

```bash
# Use your SANCTUM_API_URL from .env
curl -X POST "$SANCTUM_API_URL/v1/actions/verify" \
  -H 'Content-Type: application/json' \
  -d '{"actor":"local-agent","action":"unlock_door","context":{"time":"02:13 AM","owner_sleeping":true},"offlineMode":true}'
```

Marketing site (root): `npm run dev` → `SITE_HOST`:`SITE_PORT` from `.env`.

## Local AI (dev / PRD §9)

**Full setup guide:** [`local-ai/MODELS.md`](./local-ai/MODELS.md) (what is installed, first-time setup for new developers, commands, troubleshooting).

Models share **Hugging Face cache** weights with **llama.cpp** and **Ollama** (import via Modelfile, not `ollama pull`). Tuned for **8 GB RAM** on the current dev Mac.

| Role | Model | Ollama | llama.cpp |
|------|--------|--------|-----------|
| **Primary** (agent / production-like local runs) | Qwen2.5-**3B**-Instruct Q4_K_M (~2 GB) | `ollama run qwen2.5-3b-instruct` | `llama-cli -hf Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` |
| **Fast** (plumbing, quick checks) | Qwen2.5-**0.5B**-Instruct Q4_K_M (~0.5 GB) | `ollama run qwen2.5-0.5b-instruct` | `llama-cli -hf Qwen/Qwen2.5-0.5B-Instruct-GGUF:Q4_K_M` |

**On 8 GB:** use **3B** for realistic local agent behavior; keep **0.5B** when speed matters. Close heavy browser tabs before 3B runs. Keep `num_ctx` at **2048** (see Modelfiles).

Recreate Ollama models if the HF snapshot path changes:

```bash
ollama create qwen2.5-3b-instruct -f local-ai/Modelfile.qwen-3b
ollama create qwen2.5-0.5b-instruct -f local-ai/Modelfile.qwen-0.5b
```

Modelfiles: [`local-ai/Modelfile.qwen-3b`](./local-ai/Modelfile.qwen-3b), [`local-ai/Modelfile.qwen-0.5b`](./local-ai/Modelfile.qwen-0.5b).
