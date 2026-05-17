# Sanctum Runtime — Architecture

## Flow

1. **Operator / Agent** proposes an action with context (tool name, targets, payload hints).
2. **SDK or adapter** sends `POST /v1/actions/verify` to the runtime API.
3. **Policy engine** evaluates rules → `APPROVED`, `VERIFY` (HITL), or `BLOCKED`.
4. **Audit + events** persist; webhooks and SSE notify operators.
5. **Execution** proceeds only after approval (client responsibility).

## Major components

- `@sanctum-runtime/sdk` — TypeScript client
- `@sanctum-runtime/adapter-agent-runtime` — `protectAgent()` wrapper
- `apps/api` — Fastify control plane (`api.sanctumruntime.com`)
- `apps/dashboard` — React operator UI (`console.sanctumruntime.com`)
- Supabase — auth, policies, audit, billing metadata
- Marketing + docs — TanStack Start (`www.sanctumruntime.com`)

## APIs (selected)

- `POST /v1/actions/verify`
- `GET /v1/audit`, `POST /v1/audit/:id/resolve`
- `GET|POST /v1/policies`, YAML import/export
- `GET /v1/fleet/map`, `WS /v1/runtimes/ws`
- `GET /v1/billing/plan`, SSO routes for enterprise

See https://www.sanctumruntime.com/docs for full reference.
