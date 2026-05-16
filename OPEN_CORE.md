# Open core vs enterprise

Sanctum uses an **open-core** model (PRD §4.3): this repository is the **public adoption layer**. Enterprise intelligence and hosted control plane ship separately when built.

**Repository:** [github.com/Matik103/sanctum-runtime](https://github.com/Matik103/sanctum-runtime) — **public**, **MIT license**, visible to all developers.

**Status (v0.1):** The runtime is **ready for developers** to clone, run locally, embed the SDK, and gate agent actions. It is a **preview** — not a hosted SaaS yet.

New here? → [START_HERE.md](./START_HERE.md)

---

## Start using (public / MIT)

```bash
# SDK only (your app + self-hosted or local API)
npm install @sanctum/runtime

# Full stack (API + dashboard + examples)
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
npm install
npm run dev:runtime    # API :3001 · dashboard :5174
npm run smoke          # automated health check
npm run example:agent  # verify → execute example
```

Docs: run `npm run dev` → [http://localhost:8080/docs#quickstart](http://localhost:8080/docs#quickstart)

### What you get in this repo (OSS)

| Capability | Included |
|------------|----------|
| `@sanctum/runtime` SDK | Verify, policy hooks, middleware, audit client |
| Runtime API (`apps/api`) | `POST /v1/actions/verify`, policies, audit |
| Policy engine | Approve · Verify · Block per action |
| Local risk (Ollama) | Optional online scoring via local Qwen |
| Offline mode | Heuristics + policy when `offlineMode: true` |
| Agent adapter | `protectAgent()` — verify before execute |
| Community dashboard | Logs, policies, demos — basic control plane |
| Examples + smoke test | `examples/`, `npm run smoke` |

### OSS limitations (by design)

These stay **out of this repo** so adoption stays open and the moat stays private:

| Not in OSS (enterprise / private) | Why |
|-----------------------------------|-----|
| Advanced threat intelligence & proprietary risk models | Moat + paid intelligence layer |
| Fleet orchestration & org-wide policy sync | Enterprise operations |
| Hosted Sanctum Cloud / multi-tenant control plane | Revenue + managed service |
| Advanced analytics, trust scoring, behavioral graphs | Private telemetry & models |
| Compliance packs, signed attestation, TPM identity | Enterprise security sales |
| SIEM connectors, fleet deployment orchestration | Enterprise integrations |

**Transparency:** OSS includes **basic** heuristics, policy rules, and optional **local** Ollama calls for demos — not the full proprietary scoring stack described in PRD §4.3.2.

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
