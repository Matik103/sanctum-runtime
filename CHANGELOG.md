# Changelog

All notable changes to the public Sanctum open-core runtime are documented here.

## [Unreleased]

## [0.1.2] - 2026-05-27

### Added

**Sanctum Shield — behavioral detection and containment**

- `assessShield()` engine: 8 signal categories (identity, behavior, injection, financial, physical, secrets, security_control, blast_radius)
- Tiered financial signals: `high_value_transfer` (≥$1k) → high; `critical_financial_exposure` (≥$10k) → critical
- Score floors: blast radius `critical` → min 70; blast radius `high` → min 40
- Custom operator rules: `POST /v1/shield/rules` with action pattern (glob), response (BLOCK / REQUIRE_VERIFICATION / LOG_ONLY), `minAmount`, JSONB conditions
- 30-second in-process rule cache per org; immediate invalidation on write/delete
- `LOG_ONLY` logs containment events without blocking; `BLOCK` writes audit entry before rejecting
- Shield containment auto-resolve: `POST /v1/audit/:id/resolve` now closes linked `shield_containment_events` rows
- Dashboard: Shield page with containment log, custom rule editor, fleet kill switch

**Agent management**

- `POST /v1/orgs/:orgId/agents/:agentId/rotate` — new HMAC token; sets `token_iat_min` (old tokens immediately rejected)
- `GET /v1/orgs/:orgId/agents/:agentId/audit` — per-agent audit log (actor filter, paginated)
- `GET /v1/orgs/:orgId/agents/:agentId/stats` — 24h blocked/held/approved + worstShield + maxScore
- `GET /v1/orgs/:orgId/agents/:agentId/grants` — active time-bounded policy grants
- `POST /v1/orgs/:orgId/agents/:agentId/grants` — create grant (`action` + `durationMinutes`)
- Dashboard Agents page: multi-org switcher, StatusBadge (active/recent/idle/never), ThreatBadge, click-to-expand AgentDetail, Download .env, rotation UI, inline two-step revoke, zero-install callout

**Production hardening**

- Migration `051_shield_rules.sql`: `shield_rules` + `shield_containment_events` tables
- Migration `052_audit_shield_level.sql`: `shield_level` / `shield_score` columns on `audit_events`
- Migration `053_agent_token_rotation.sql`: `token_iat_min bigint` on `agent_registrations`
- Migration `054_production_indexes.sql`: `audit_events(actor)`, `audit_events(action)`, `shield_containment_events(audit_id)`, webhook dead-letter index
- Structured logging: replaced all `console.log/warn/error` in `heap-watchdog.ts`, `email-queue-worker.ts`, `index.ts` startup/shutdown with pino child loggers
- `GET /v1/webhooks/dead` — org-scoped dead-letter endpoint for permanently-failed webhook deliveries
- `Dockerfile` — production-ready multi-stage Docker image (`docker build -t sanctum/runtime .`)

**CLI expansion** (`@sanctum-runtime/cli`): 3 → 11 commands

- `sanctum audit [--limit N] [--org id]`
- `sanctum policies list` / `policies import --file <yaml>`
- `sanctum agents list | rotate | stats` (with `--org`, `--agent`)
- `sanctum shield rules | events`
- `sanctum webhooks dead | status`

### Fixed

- Shield test fixtures used wrong action names for blast-radius tests
- Custom BLOCK rules wrote no audit entry (now appended before returning 403)
- `resolveAuditEntry()` guard skipped REQUIRE_VERIFICATION upgrade; now uses `updateEntry()` directly
- Double containment logging when LOG_ONLY + high/critical both fired for same action
- Bare `*` wildcard pattern in Shield rules crashed `action.startsWith('')`
- Amount coercion in rule evaluation now resolves `amount ?? value ?? total`
- Shield upsert crashed on pre-052 Supabase instances; columns now conditionally included

## [0.1.1] - 2026-05-16

### Added

- **Python SDK** (`sanctum-runtime` on PyPI path: `packages/python-sdk`) — parity with `@sanctum-runtime/sdk`
- **`@sanctum-runtime/cli`** — `sanctum status`, `sanctum verify`, `sanctum policies export`
- **Integration guides** — [docs/integrations](./docs/integrations/) (LangChain, CrewAI, MCP)
- **API key registry** — `api_keys` table, `/v1/api-keys`, dashboard **Devices** create/revoke
- **Supabase auth portal** — `portal_type` operator/enterprise, org bootstrap (`008_auth_portal.sql`)
- **Mission-control auth UI** — operator/enterprise, SSO, responsive layout
- **Verification shortcuts** — `A` / `Shift+A` / `D` in review modal
- **ROS 2 starter** — [examples/ros2-starter](./examples/ros2-starter/)

### Changed

- `@sanctum-runtime/sdk` and adapter bumped to **0.1.1** (public API locked for adopters)
- Dashboard quickstart snippet uses configured `VITE_SANCTUM_API_URL`
- Clearer error when production dashboard missing API URL env at build time

### Added (prior unreleased, now in 0.1.1 release notes context)

- **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** — complete OSS reference (API, SDK, policies, models, webhooks)
- **Pluggable risk model** (`services/risk-model`) — Ollama, OpenAI-compatible APIs, or `SANCTUM_RISK_PROVIDER=none`
- **Unlimited policies** — `POST`/`DELETE` `/v1/policies`, `registerPolicy()`, dashboard Add/Remove
- **Per-action `riskPrompt`** — custom risk model instructions per policy
- **Policy YAML** — `GET /v1/policies/export.yaml`, `POST /v1/policies/import.yaml`, [examples/policies.example.yaml](./examples/policies.example.yaml)
- **Webhooks** — `verification.required`, `action.blocked`, `verification.resolved` with optional HMAC
- **Verification resume** — `GET /v1/verifications/:id`, `waitForVerification()`, `protectAgent` + `awaitVerification`
- **Org-scoped policies** — `org_id` in context, keys like `acme:unlock_door`
- **Supabase audit mirror** — optional sync to `audit_events` when configured
- **GitHub Actions CI** — build + `npm run smoke` on PRs
- [HOSTED.md](./HOSTED.md) — self-host deployment guide
- **`@sanctum-runtime/adapter-agent-runtime`** — publishable npm package for `protectAgent()` and `AgentActions`
- `examples/npm-consumer/run.mjs` and `npm run example:npm` for external-app verification

### Fixed

- `npm run example:agent` handles `REQUIRE_VERIFICATION` correctly (SDK error imports from `@sanctum-runtime/sdk`)
- Docs and marketing samples use `@sanctum-runtime/adapter-agent-runtime` instead of unpublished `@sanctum/adapter-agent-runtime`
- Dashboard waits for API before Vite starts (`scripts/wait-for-api.mjs`); shows banner when API is down (avoids proxy 500 spam)
- Cloudflare Workers Git builds use npm (`bun.lock` removed); `npm run cf:build` for dashboard deploy
- `START_HERE.md` clarifies repo root, dashboard URL (5174) vs API (3001)
- Smoke/monitor scripts send `SANCTUM_API_KEY` when configured

## [0.1.0] - 2026-05-15

### Added

- **@sanctum-runtime/sdk** on npm — `SanctumRuntime`, `SanctumClient`, middleware, policy helpers
- Runtime API (`apps/api`) — verify, policies, audit, status, health
- Policy engine — approve / verify / block per action
- Runtime engine — intercept → policy → Ollama/heuristics → decision → audit
- Agent adapter — `protectAgent()` verify-before-execute
- Community dashboard — mission control UI on port 5174
- Ollama bridge — local Qwen risk scoring
- `npm run dev:runtime`, `npm run smoke`, `npm run example:agent`
- [OPEN_CORE.md](./OPEN_CORE.md) — public vs enterprise boundaries
- Marketing/docs — **Start with Runtime** primary CTA, enterprise waitlist secondary

### Notes

- v0.1 is a **local-first preview**: clone repo + run API; hosted Sanctum Cloud is not included (enterprise track).
- MIT license for all packages in this repository.

[0.1.0]: https://github.com/Matik103/sanctum-runtime/releases/tag/v0.1.0
