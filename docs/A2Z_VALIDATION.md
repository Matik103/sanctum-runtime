# Production A–Z validation

End-to-end check of every shipped surface (PRD MVP + Connect + billing tiers).

## Setup (once)

```bash
cp .env.a2z.example .env.a2z.local
# Edit .env.a2z.local — team account email + password for browser smoke

# OpenAI for online risk + Connect proxy (one of):
#   OPENAI_API_KEY=sk-... in .env
#   TEST_PLATFORM_KEY=sk-... via e2e bootstrap

TEST_USER_EMAIL=you@example.com npm run e2e:bootstrap
```

## Run

```bash
npm run a2z           # production API + console + Playwright
npm run a2z:local     # also starts local API + npm run smoke
A2Z_SKIP_BROWSER=1 npm run a2z   # API-only (CI)
npm run a2z:browser   # Playwright only
npm run a2z:modules   # API write flows per module (policies, shield, workflows, …)
```

## Sections

| Section | Covers |
|---------|--------|
| A | Marketing, docs, console, CORS, crawl |
| B | Auth, `my_profile`, enterprise RPC |
| C | Verify offline + online (OpenAI), audit |
| D/E | Signup, accounts, Connect, Live Feed, control plane |
| F | Dashboard JWT + API key routes |
| H | Module write flows (policy CRUD, shield rule, workflow, alerts, agents, fleet pause, assurance, orchestration) |
| G | Attestation |
| I | Creem webhook (if `CREEM_WEBHOOK_SECRET` set) |
| L | Developer tier 402 gating |
| M | Plan alignment / migrations |
| N | Playwright — smoke + all 21 sidebar modules |
| Connect | `npm run a2z:connect` — real actions + Live Feed watch |

Exit code 0 = production ready for automated coverage.
