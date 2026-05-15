# Sanctum Runtime

**Runtime trust infrastructure for autonomous AI systems** — a layer developers install into agents, backends, and robotics stacks (not a standalone app users open).

[Quick start](#quick-start) · [Open core vs enterprise](#open-core-vs-enterprise) · [Marketing CTAs](#marketing-site-links)

## What this repo is (public / open source)

This repository is the **open-core adoption layer** (PRD §4.3.1):

| Included (public) | Not in this repo (private / future) |
|-------------------|-------------------------------------|
| `@sanctum/runtime` SDK | Advanced threat intelligence & proprietary risk models |
| Runtime API + policy engine (approve / verify / block) | Fleet orchestration & enterprise policy sync |
| Ollama / local verification bridge | Hosted Sanctum Cloud, compliance packs, TPM attestation |
| Community dashboard (basic) | Advanced analytics, trust scoring, behavioral intelligence |
| Agent adapter + docs | `sanctum-enterprise`, `sanctum-cloud`, `sanctum-intelligence` repos |

**License:** MIT (see [LICENSE](./LICENSE)) — enterprise features may be separately licensed later (PRD §4.3).

## Quick start

```bash
git clone https://github.com/Matik103/sanctum-runtime.git
cd sanctum-runtime
npm install
npm run dev:runtime   # API http://127.0.0.1:3001 · dashboard http://127.0.0.1:5174
```

Marketing site + public docs:

```bash
npm run dev           # http://localhost:8080 · /docs
```

```ts
import { SanctumRuntime } from "@sanctum/runtime";

const sanctum = new SanctumRuntime({
  baseUrl: "http://127.0.0.1:3001",
  offlineMode: true,
});

await sanctum.middleware()({
  action: "send_email",
  context: { to: "user@example.com" },
  execute: async () => sendEmail(),
});
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) and [PRD.md](./PRD.md) for scope and architecture.

## Making open source public on GitHub

1. **Keep this repo public** — everything here is intended to be OSS (runtime, SDK, basic dashboard, docs content in `src/routes/docs.tsx`).
2. **Do not commit private code** — enterprise orchestration, advanced detection, or cloud control plane live in **separate private repositories** when you build them (`sanctum-enterprise`, `sanctum-cloud`, `sanctum-intelligence`).
3. **Publish from `main`** — tags/releases for `@sanctum/runtime` when you publish to npm; GitHub Releases for changelog.
4. **Optional GitHub settings:** Issues + Discussions for community; **Early access** via issue template (`.github/ISSUE_TEMPLATE/early-access.md`) or an external form URL in marketing env (`VITE_EARLY_ACCESS_URL`).

## Open core vs enterprise

| Public (this repo) | Private (later) |
|--------------------|-----------------|
| How Sanctum works — SDK, policies, local runtime, examples | How Sanctum gets smarter — fleet AI, enterprise analytics, cloud |

Details: [PRD §4.3](./PRD.md).

## Marketing site links

| CTA | Should point to |
|-----|-----------------|
| **Docs** | `/docs` on the marketing site (same deploy as `npm run dev`) |
| **Get Early Access** | Waitlist form (`VITE_EARLY_ACCESS_URL`) or GitHub early-access issue — **not** the runtime install |

Configure in `.env` (see `.env.example`).
