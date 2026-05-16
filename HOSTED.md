# Hosting Sanctum Runtime (self-hosted / cloud)

OSS developers run the API on their own infrastructure. **Sanctum Cloud** (managed hosting) is a separate product — this guide is for **your** deployment.

**Full OSS capabilities (API, policies, webhooks, models):** [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

## What you deploy

| Component | Required? | Notes |
|-----------|-----------|--------|
| **Runtime API** (`apps/api`) | Yes | `POST /v1/actions/verify`, audit, policies |
| **Ollama** (or other local model) | Optional | Online risk scoring; offline heuristics work without it |
| **Dashboard** (`apps/dashboard`) | Optional | Operators only |
| **Supabase** | Optional | Auth + audit mirror — see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) |

Agents use **`@sanctum-runtime/sdk`** pointed at your API URL — they do not need the dashboard.

## Minimal production `.env`

```bash
HOST=0.0.0.0
PORT=3001
SANCTUM_API_KEY=<generate-with-openssl-rand-hex-32>
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5-3b-instruct

# Optional dashboard auth
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Docker (example)

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY scripts ./scripts
RUN npm ci
RUN npm run build:sdk && npm run build:packages
ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "@sanctum/api"]
```

Run with a volume for `data/` (audit + policies persistence).

## Verification workflow (agents + operators)

1. Agent calls `verifyAction` with a `correlationId` → `REQUIRE_VERIFICATION`.
2. Operator approves in the dashboard (or `POST /v1/audit/:id/resolve`).
3. Agent calls `waitForVerification(correlationId)` or uses `protectAgent` with `awaitVerification`.

```ts
await protectAgent(runtime, {
  action: 'unlock_door',
  context: { org_id: 'acme', heard: 'Open the door' },
  correlationId: 'run-42',
  awaitVerification: { timeoutMs: 120_000 },
  execute: async () => unlock(),
})
```

## Org-scoped policies

Pass `org_id` in action `context`. Policies can be stored as `acme:unlock_door` in `data/policies.json` or via:

`PATCH /v1/policies/acme:unlock_door`

List org view: `GET /v1/orgs/acme/policies`

## Supabase audit mirror

When `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set, each audit entry is upserted to `audit_events`. Run migration:

`supabase/migrations/002_audit_events.sql`

## Health checks

- `GET /health` — liveness
- `GET /v1/status` — Ollama + audit counts (requires auth if configured)

## Sanctum Cloud (roadmap)

Managed multi-tenant API, fleet policies, and enterprise intelligence remain **out of OSS** — [OPEN_CORE.md](./OPEN_CORE.md).
