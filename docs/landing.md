# Sanctum Runtime — the trust boundary for autonomous systems

> Not a chat guardrail. Not an audit log. The boundary.

## Why this exists

Every autonomous system that does anything meaningful eventually faces the
same question:

> What happens when the model decides to unlock a door, send a wire,
> charge a card, delete a record, or call production?

You can't answer that in the prompt. You can't answer it in a moderation
filter. You need a **runtime trust boundary** — a separate, signed, audited
layer that sits between *the model proposed an action* and *the executor
ran it*.

Sanctum is that layer.

## What you get

| Capability                         | What it does                                                                |
| ---------------------------------- | --------------------------------------------------------------------------- |
| **Sanctum Shield**                 | Early warning and containment; blocks critical execution before side effects |
| **Signed action tokens**           | HMAC-signed, 5-min TTL, scoped — executor refuses to run without one        |
| **Blast-radius scoring**           | 0-100 score with factors (money, data, reversibility, physical, external)   |
| **Source-trust classification**    | 7 levels; deterministic indirect-prompt-injection defense                   |
| **Dual approver + auto-escalate**  | Two distinct approvers for high blast; stale verifications re-push          |
| **Policy replay**                  | "If today's rules had existed yesterday, what would have changed?"          |
| **Fleet kill switch**              | Mobile-accessible org-wide pause                                            |
| **SOC2 + NIST AI RMF evidence**    | 16 mapped controls; downloadable JSON for auditors                          |
| **Domain policy packs**            | Healthcare PHI, finance transfers, ROS2 safety, MCP baseline, Claude Desktop |
| **16 framework adapters**          | LangChain, Vercel AI, OpenAI Agents, Mastra, MCP, CrewAI, ROS2, Claude Desktop, n8n, AutoGen, Pydantic AI, LlamaIndex, smolagents, Bedrock Agents, Browser-use, Home Assistant |

## Who Sanctum is for

- **Agent builders** — LangChain, CrewAI, OpenAI Agents, Mastra, AutoGen, Pydantic AI, LlamaIndex, smolagents
- **MCP server authors** — anyone shipping `@modelcontextprotocol/server-*`
- **Robotics teams** — ROS2 nodes, humanoid stacks, industrial control
- **Smart home / IoT** — Home Assistant automations driven by LLMs
- **Workflow automation** — n8n, Zapier, Make, Temporal
- **Browser / computer-use agents** — Stagehand, Browser-use, Claude computer-use
- **Compliance teams** — SOC2, HIPAA, NIST AI RMF, ISO 10218
- **Security teams** — actor-identity-native runtime control, not chat moderation

## Why not [other thing]?

| Tool             | Different because                                                                  |
| ---------------- | ---------------------------------------------------------------------------------- |
| Tracehold        | Cloud-ops focus, no robotics / physical, no signed tokens, closed source           |
| GuardPlane       | Endpoint / syscall layer, no policy replay, no blast radius scoring                |
| AgentID          | Identity-focused, no domain marketplace, no indirect-prompt-injection primitives  |
| Repello / Guardion | Chat / LLM guardrails, not pre-execution action gating                           |
| NeMo Guardrails  | Prompt-level, not runtime action-level                                             |
| Prompt firewalls | Stop bad prompts; don't gate the side effect if the prompt slips through         |

Sanctum is the only one that's **MIT-licensed**, **runs locally**, ships
**signed action tokens**, scores **physical-world blast radius**, and exposes
the **whole 8-feature roadmap** the market is converging on.

## 60-second quick start

```bash
# 1. Install the SDK in your agent
npm install @sanctum-runtime/sdk @sanctum-runtime/adapters

# 2. Wrap your tool
import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapLangChainTool } from '@sanctum-runtime/adapters/langchain'

const client = new SanctumClient({ baseUrl: 'http://localhost:8080' })
const safeTransfer = wrapLangChainTool(transferTool, { client, agentId: 'my-agent' })

# 3. Run Sanctum API locally
docker run -p 8080:8080 sanctum/runtime

# 4. Watch verify requests in the dashboard
open https://console.sanctumruntime.com
```

That's it. Every call to `safeTransfer` now flows through Sanctum first.
Block / verify / approve based on your policies, with operator approval on
desktop or mobile.

## Architecture diagram

```
  agent proposes action
        │
        ▼
   ┌─────────────────────────────┐
   │  Sanctum runtime gate        │
   │  ─ policy engine             │
   │  ─ blast-radius scoring      │
   │  ─ source-trust classifier   │
   │  ─ anomaly detection         │
   │  ─ Shield containment        │
   │  ─ optional risk model       │
   └─────────────────────────────┘
        │
        ├─→  APPROVED + signed action_token  ──▶  executor verifies → side effect runs
        ├─→  REQUIRE_VERIFICATION             ──▶  human approves (desktop / mobile)
        └─→  BLOCKED                          ──▶  audit log + alerts, no side effect
```

Every decision is captured in an append-only audit log with provenance:
who approved, when, dual-approval state, what the policy was at decision
time, what the blast radius was. Downloadable as SOC2 / NIST AI RMF
evidence on demand.

## Get started

- **GitHub**: <https://github.com/Matik103/sanctum-runtime>
- **npm**: `npm install @sanctum-runtime/sdk`
- **PyPI**: `pip install sanctum-runtime`
- **Docs**: [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md)
- **Domain examples**:
  - [Healthcare PHI](./examples/healthcare-phi.md)
  - [Finance transfers](./examples/finance-transfers.md)
  - [Robotics / ROS2](./examples/robotics-ros2.md)
  - [MCP tool servers](./examples/mcp-tools.md)

MIT licensed. Open core. Local-first. Self-hostable.
