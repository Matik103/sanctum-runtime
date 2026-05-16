# Changelog

All notable changes to the public Sanctum open-core runtime are documented here.

## [Unreleased]

### Added

- **`@sanctum-runtime/adapter-agent-runtime`** — publishable npm package for `protectAgent()` and `AgentActions`
- `examples/npm-consumer/run.mjs` and `npm run example:npm` for external-app verification

### Fixed

- `npm run example:agent` handles `REQUIRE_VERIFICATION` correctly (SDK error imports from `@sanctum-runtime/sdk`)
- Docs and marketing samples use `@sanctum-runtime/adapter-agent-runtime` instead of unpublished `@sanctum/adapter-agent-runtime`
- Dashboard waits for API before Vite starts (`scripts/wait-for-api.mjs`); shows banner when API is down (avoids proxy 500 spam)
- Cloudflare Workers Git builds use npm (`bun.lock` removed); `npm run cf:build` for dashboard deploy
- `START_HERE.md` clarifies repo root, dashboard URL (5174) vs API (3001)

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
