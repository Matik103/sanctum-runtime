# Sanctum Runtime — runtime trust infrastructure for autonomous agent fleets

> Not a chat guardrail. Not an audit log. The decision layer.

## Why this exists

Autonomous agents don't just talk — they act. Send emails, move robots,
transfer funds, delete records, call production APIs. Every one of those
actions needs a trusted answer before the side effect runs:

> *Should this happen right now — given who asked, where the instruction
> came from, what the risk is, and what the policies say?*

You can't answer that in a prompt. You can't answer it in a content filter.
You need a **runtime trust layer** that sits between *the agent proposed an
action* and *the executor ran it* — one that detects threats before they
materialize, contains them, requires human sign-off when the stakes are
high, and proves it all happened correctly.

Sanctum is that layer. For single agents and for fleets of hundreds.

## What you get

| Capability                         | What it does                                                                |
| ---------------------------------- | --------------------------------------------------------------------------- |
| **Sanctum Shield**                 | Behavioral detection across 8 signal categories; operator-defined containment rules (action glob · financial threshold · BLOCK/REQUIRE_VERIFICATION/LOG_ONLY); score floors for critical-blast actions |
| **Agent fleet management**         | Per-agent threat summary (24h blocked/held/approved · worst Shield level); activity drill-down; token rotation with immediate invalidation; time-bounded policy grants; Download .env |
| **Zero-install connections**       | Any agent connects via direct HTTP with `X-Agent-Token` — no SDK, no install. Works from mobile, browser, scripts |
| **Signed action tokens**           | HMAC-SHA256, 5-min TTL, scoped to actor + action + org — executor refuses to run without one |
| **Blast-radius scoring**           | 0-100 score: money, data sensitivity, reversibility, physical-world, external destination |
| **Source-trust classification**    | 7 levels including `untrusted_content`; deterministic indirect-prompt-injection defense |
| **Dual approver + auto-escalate**  | Two distinct approvers for high-blast; stale verifications re-push automatically |
| **Policy replay**                  | "If today's rules had existed yesterday, what would have changed?" |
| **Fleet kill switch**              | One-click org-wide pause; mobile-accessible; resumes cleanly |
| **SOC2 + NIST AI RMF evidence**    | 16 mapped controls; downloadable JSON for auditors |
| **Domain policy packs**            | Healthcare PHI, finance transfers, ROS2 safety, MCP baseline, Claude Desktop |
| **16 framework adapters**          | LangChain, Vercel AI, OpenAI Agents, Mastra, MCP, CrewAI, ROS2, Claude Desktop, n8n, AutoGen, Pydantic AI, LlamaIndex, smolagents, Bedrock Agents, Browser-use, Home Assistant |
| **Python + TypeScript SDKs**       | Full parity; `pip install sanctum-runtime` or `npm install @sanctum-runtime/sdk` |
| **Docker + self-host**             | `docker build -t sanctum/runtime .` — production-ready, no vendor lock-in |

## Who Sanctum is for

- **Agent builders** — LangChain, CrewAI, OpenAI Agents, Mastra, AutoGen, Pydantic AI, LlamaIndex, smolagents
- **Agent fleet operators** — manage credentials, monitor per-agent threats, grant time-bounded approvals
- **MCP server authors** — anyone shipping `@modelcontextprotocol/server-*`
- **Mobile-first operators** — approve or block from your phone; agents connect without installing anything
- **Robotics teams** — ROS2 nodes, humanoid stacks, industrial control
- **Smart home / IoT** — Home Assistant automations driven by LLMs
- **Workflow automation** — n8n, Zapier, Make, Temporal
- **Browser / computer-use agents** — Stagehand, Browser-use, Claude computer-use
- **Compliance teams** — SOC2, HIPAA, NIST AI RMF, ISO 10218
- **Security teams** — proactive behavioral detection, not reactive log review

## Why not [other thing]?

| Tool             | Different because                                                                  |
| ---------------- | ---------------------------------------------------------------------------------- |
| Tracehold        | Cloud-ops focus, no robotics / physical, no signed tokens, no fleet management, closed source |
| GuardPlane       | Endpoint / syscall layer, no policy replay, no blast radius scoring, no agent lifecycle |
| AgentID          | Identity-focused, no threat detection, no domain marketplace, no token rotation   |
| Repello / Guardion | Chat / LLM guardrails, not pre-execution action gating, no fleet ops             |
| NeMo Guardrails  | Prompt-level, not runtime action-level                                             |
| Prompt firewalls | Stop bad prompts; don't gate the side effect if the prompt slips through         |

Sanctum is the only one that's **MIT-licensed**, **runs locally**, ships **signed action tokens**, scores **physical-world blast radius**, detects threats **before execution**, manages **agent fleets** end-to-end, and works from **any device** with zero install.

## 60-second quick start

```bash
# 1. Install the SDK in your agent
npm install @sanctum-runtime/sdk @sanctum-runtime/adapters

# 2. Wrap your tool
import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapLangChainTool } from '@sanctum-runtime/adapters/langchain'

const client = new SanctumClient({ baseUrl: 'http://localhost:3001' })
const safeTransfer = wrapLangChainTool(transferTool, { client, agentId: 'my-agent' })

# 3. Run Sanctum API locally (Docker)
docker build -t sanctum/runtime . && docker run -p 3001:3001 sanctum/runtime

# — or — run from source
git clone https://github.com/Matik103/sanctum-runtime && cd sanctum-runtime
cp .env.example .env && npm install && npm run dev:api

# 4. Watch verify requests in the dashboard
open http://localhost:5174
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
