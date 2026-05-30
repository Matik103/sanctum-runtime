# Connect Agent

Connect Agent lets teams gate OpenAI-compatible LLM traffic **without embedding the full SDK**. Point your client at the Sanctum proxy, add an agent token header, and tool proposals appear in Live Feed with the same verify / hold / block pipeline as SDK integrations.

## Quick start

1. **Create an agent** in Dashboard → Agents. Copy the token (shown once).
2. **Connect** (Dashboard → Connect): save your platform API key, pick the agent, copy the proxy URL.
3. **Configure your client**:

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.sanctumruntime.com/v1/proxy/openai",
    default_headers={"X-Sanctum-Agent-Token": "sk_agent_..."},
)
```

4. **Watch Live Feed** — each model `tool_call` is verified before your client receives it.

## Three gating layers

| Layer | When | How |
|-------|------|-----|
| **Proposal** | Model returns `tool_calls` in chat completion | Automatic via proxy |
| **Tool result** | Agent sends `role: tool` messages upstream | Enable *Gate tool results* in Connect settings |
| **Execution** | Your code runs the tool locally | Call `POST /v1/connect/verify-execution` or use `@sanctum-runtime/connect` |

Proposal gating is automatic. Local execution requires an explicit verify call unless you only use remote tools.

## Proxy modes

- **Gate** — verify every tool call; block or hold per policy.
- **Observe** — log to audit only; no blocking. Use for onboarding, then **Promote observe → gate** on the Connect page.

## Org settings

`GET/PUT /v1/orgs/:orgId/connect/settings`

| Field | Purpose |
|-------|---------|
| `proxy_mode` | `gate` or `observe` |
| `wait_verification` | Block proxy response until operator approves held actions |
| `gate_tool_results` | Verify outgoing tool-result messages |
| `redact_tool_arguments` | Redact sensitive args in audit |
| `enforce_action_token` | Require signed action token from verify-execution before local run |
| `connect_webhook_url` | POST JSON on held/blocked Connect events |
| `credential_environment` | `development` / `staging` / `production` for platform keys |

## Policies & Shield

- **Policy presets** — Strict, Balanced, Observe bundles applied per org.
- **Shield bundles** — one-click policy + Shield rules tuned for Connect (`connect-production`, `connect-balanced-shield`).
- **Per-tool policy** — Live Feed row actions: Hold tool, Block, Auto-approve (`POST .../connect/tools/:action/policy`).
- **Suggestions** — from Live Feed activity and the `connect_tools` registry (schema-aware).

Connect uses the **same policy engine and Shield** as the SDK — policies you set in Dashboard apply to proxy traffic.

## Execution verify

```http
POST /v1/connect/verify-execution
X-Sanctum-Agent-Token: sk_agent_...

{
  "action": "send_email",
  "arguments": { "to": "ops@acme.com" },
  "platform": "openai",
  "tool_call_id": "call_abc"
}
```

Returns `{ ok, decision, entry, actionToken }` when approved. Poll held verifications:

```http
GET /v1/connect/verifications/:correlationId
X-Sanctum-Agent-Token: sk_agent_...
```

## @sanctum-runtime/connect

Thin helpers without the full SDK:

```bash
npm install @sanctum-runtime/connect
```

```ts
import { ConnectClient, runGatedToolCalls } from '@sanctum-runtime/connect'
import { createSanctumTools } from '@sanctum-runtime/connect/langchain'
import { createConnectMcpHook } from '@sanctum-runtime/connect/mcp'
```

## Governance workflows

When a Connect proxy hold matches an org governance workflow, a pending approval is created and Connect-branded notifications are sent (email/push when configured). Webhooks fire on held and blocked events when `connect_webhook_url` is set.

## Health & credentials

- `GET /v1/orgs/:orgId/connect/health` — 7-day proxy stats, top tools, credential age, 30-day usage.
- Platform keys are encrypted in Supabase; support per-environment keys (`development` / `staging` / `production`).
- Rotate platform keys when health shows 90+ day age — use the **Key rotation wizard** on the Connect page (select platform → paste new key → auto-test).

## Connect vs SDK

| | Connect | SDK |
|---|---------|-----|
| Setup | Proxy URL + agent token | In-process middleware |
| Proposal gating | Automatic | Automatic |
| Local execution | `verify-execution` or `@sanctum-runtime/connect` | Built-in |
| Arbitrary action types | OpenAI-compatible paths | Any action string |

## Data model

- `platform_credentials` — encrypted platform API keys
- `connect_org_settings` — org Connect configuration
- `connect_tools` — tool registry from proxy traffic
- `audit_events` where `context.proxy = true`
