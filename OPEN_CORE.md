# Open core vs enterprise

Sanctum uses an **open-core** model (PRD §4.3): this repository is the **public adoption layer**. Enterprise intelligence and hosted control plane ship separately when built.

**Repository:** [github.com/Matik103/sanctum-runtime](https://github.com/Matik103/sanctum-runtime) — **public**, **MIT license**, visible to all developers.

**Status (v0.1):** The runtime is **ready for developers** to clone, run locally, embed the SDK, and gate agent actions. It is a **preview** — not a hosted SaaS yet.

New here? → [START_HERE.md](./START_HERE.md) · Full OSS reference → [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)

---

## Start using (public / MIT)

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
cp .env.example .env   # set your hosts/ports — required
npm install
npm run dev:runtime
npm run smoke
```

SDK in your own app: `npm install @sanctum-runtime/sdk` and set `baseUrl` to your API URL.

Docs: configure `SITE_*` in `.env`, then `npm run dev` → `/docs#quickstart`

### What you get in this repo (OSS)

| Capability | Included |
|------------|----------|
| `@sanctum-runtime/sdk` SDK | Verify, policy hooks, middleware, audit client |
| Runtime API (`apps/api`) | `POST /v1/actions/verify`, policies, audit |
| Policy engine | Unlimited action policies — approve · verify · block per action |
| Pluggable risk model | Ollama, OpenAI-compatible APIs, or heuristics-only (`SANCTUM_RISK_PROVIDER`) |
| Per-action risk prompts | `riskPrompt` on each policy — custom model instructions (OSS) |
| Policy YAML I/O | `GET /v1/policies/export.yaml`, `POST /v1/policies/import.yaml` |
| Webhooks | HTTP POST on verify / block / resolve (`SANCTUM_WEBHOOK_URL`) |
| Local risk (Ollama) | Optional online scoring via local Qwen |
| Offline mode | Heuristics + policy when `offlineMode: true` |
| Agent adapter | `protectAgent()` — verify before execute |
| Community dashboard | Logs, policies, verification queue — local control plane |
| Examples + smoke test | `examples/`, `npm run smoke` |
| Verification resume | `GET /v1/verifications/:correlationId`, `waitForVerification`, `protectAgent` + `awaitVerification` |
| CI on pull requests | [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) — build + `npm run smoke` |
| Optional cloud audit | Supabase `audit_events` mirror when `SUPABASE_*` is set — [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) |
| Org-scoped policies | `context.org_id` + keys like `acme:unlock_door` — [HOSTED.md](./HOSTED.md) |
| Self-hosted deployment | [HOSTED.md](./HOSTED.md) — run API on your infra |

### Enterprise / next stage (OSS v0.1 is complete for adoption)

**Clone → API → SDK → gate actions → optional dashboard** is fully supported. See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for everything in OSS.

| Capability | OSS (this repo) | Enterprise (later) |
|------------|-----------------|---------------------|
| Verification resume | `awaitVerification`, `waitForVerification` | Workflow orchestration, signed attestations |
| CI | GitHub Actions smoke | Release gates, E2E dashboard |
| Audit | Local JSONL + optional Supabase mirror | Multi-tenant cloud control plane |
| Policies | Unlimited + YAML + org keys | Fleet-wide sync, policy DSL |
| Hosting | [HOSTED.md](./HOSTED.md) self-host | Managed Sanctum Cloud |
| Webhooks | HTTP POST + HMAC | DLQ, retry, multi-tenant routing |

### OSS limitations (by design)

These stay **out of this repo** so adoption stays open and the moat stays private:

| Not in OSS (enterprise / private) | Why |
|-----------------------------------|-----|
| Advanced threat intelligence & proprietary risk models | Moat + paid intelligence layer |
| Fleet orchestration & org-wide policy sync | Enterprise operations |
| Hosted Sanctum Cloud / multi-tenant control plane | Revenue + managed service |
| Advanced analytics, trust scoring, behavioral graphs | Private telemetry & models |
| Compliance packs, signed attestation, TPM identity | Enterprise security sales |
| SIEM connectors, signed attestation packs, fleet deployment orchestration | Enterprise integrations |
| Advanced webhook routing, retry DLQ, multi-tenant signing | Enterprise control plane |

**Transparency:** OSS includes **basic** heuristics, policy rules, and optional **local** Ollama scoring — not the full proprietary intelligence stack described in PRD §4.3.2.

---

## Enterprise & design partners

Interested in fleet management, hosted runtime, compliance, or advanced detection?

- Open a GitHub issue: [Early access / enterprise](https://github.com/Matik103/sanctum-runtime/issues/new?template=early-access.md)
- Or set `VITE_EARLY_ACCESS_URL` on the marketing site to your waitlist form

**Future private repos:** `sanctum-enterprise`, `sanctum-cloud`, `sanctum-intelligence` (not public yet).

---

## Licensing

| Tier | License | Where |
|------|---------|--------|
| Open core (this repo) | **MIT** | [LICENSE](./LICENSE) |
| Enterprise features (future) | Commercial / dual-license | Separate repos & contracts |

---

## For contributors

See [DEVELOPMENT.md](./DEVELOPMENT.md) and [PRD.md](./PRD.md). Do not add enterprise-only capabilities to this repo without an explicit PRD update and a plan for the private layer.
