# Sanctum Runtime — SDK

## JavaScript / TypeScript

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapter-agent-runtime
```

```typescript
import { SanctumRuntime } from "@sanctum-runtime/sdk";
import { protectAgent, AgentActions } from "@sanctum-runtime/adapter-agent-runtime";

const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! });

await protectAgent(sanctum, {
  action: AgentActions.SEND_EMAIL,
  context: { to: "user@example.com" },
  offlineMode: true,
  execute: async () => sendEmail(),
});
```

## Python

Package: `sanctum-runtime` (see `packages/python-sdk` in the monorepo).

## CLI

`@sanctum-runtime/cli` — smoke tests and operator utilities.

## Environment

- `SANCTUM_API_URL` — e.g. https://api.sanctumruntime.com
- `SANCTUM_API_KEY` — `sk_sanctum_*` from dashboard or legacy server key

Docs: https://www.sanctumruntime.com/docs#quickstart
