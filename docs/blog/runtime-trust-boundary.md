# The runtime trust boundary: where autonomy meets the real world

The agent market is in the middle of a shift that hasn't been named yet, so
let me name it. We are moving from **prompt guardrails** to **runtime
control of agent actions**. The center of gravity used to be: *can we stop
the model from saying something bad?* The new center of gravity is:
*can we stop the system from doing something it shouldn't, regardless of
what the model decided?*

These are different problems. They live in different parts of the stack.
They require different primitives. And the second one is where the next
generation of trust infrastructure for autonomous systems is being built.

## The fundamental observation

Every meaningful autonomous system — LLM agent, MCP server, robot, browser
bot, computer-use agent, smart-home automation, finance workflow — ends up
at the same architectural point:

> A *proposed action* meets a *side effect*.

A function call about to run. A topic about to publish. A wire about to
transfer. A door about to unlock. An email about to send.

The model picked the action. The model can be wrong. The model can be
*driven wrong* — by content it read, by a previous tool result, by a memory
it retrieved. The line between *the agent decided* and *the action runs* is
where blast-radius lives, where compliance lives, where insurance lives,
where the difference between a near-miss and a settlement lives.

That line needs a runtime. Not a prompt. Not a moderator. **A runtime.**

## What the runtime needs to do

If you sit down and design that runtime from scratch, eight requirements fall
out of the problem:

1. **Identity per action.** Actor, tool, runtime, environment, permission,
   scope, expiry, correlation chain. OAuth for actions, not just verification.
2. **Signed tokens.** When the runtime approves, it signs. When the executor
   runs, it verifies. Otherwise the runtime is advisory, not enforceable.
3. **Replay and simulation.** "If today's policies had existed yesterday,
   what would have changed?" That's how policy rollout becomes safe, how
   compliance evidence becomes generatable, how shadow mode becomes
   possible.
4. **Human on-the-loop, not in-the-loop.** Approve once, approve for a
   window, approve under conditions, require second approver for high blast,
   auto-escalate unusual patterns. Don't ask humans the same question 200
   times — they will rubber-stamp.
5. **Blast-radius scoring.** Money. Data sensitivity. Reversibility.
   External destination. Physical-world impact. Credential scope. A
   verification request the operator can answer in two seconds.
6. **Source-trust classification.** Did this instruction come from a user,
   a webpage, a tool result, agent memory? Hostile content can influence
   the model but it cannot bypass the boundary — *if* the boundary knows
   to look.
7. **Evidence packages.** SOC2, NIST AI RMF, HIPAA, ISO 10218. Not logs.
   Mapped, exportable, auditor-ready.
8. **Domain policy distribution.** Healthcare PHI safety, finance transfer
   safety, robotics safety, MCP tool baselines, computer-use defaults.
   The runtime scales by domain, not by hardcoding everything.

We just shipped all eight. Open source. MIT. Today.

## Why "trust boundary" beats "AI security"

The phrase "AI security" is too narrow for what this actually is.

A robot crushing a fixture is not an AI problem. A smart-home automation
unlocking the wrong door is not an AI problem. A workflow bot wiring
$50,000 to an attacker is barely an AI problem. They are all the same
problem expressed in different domains: **a proposed autonomous action met
an unguarded side effect**.

Calling the layer "AI security" is anchoring on the model. The model is
just one of many things that can drive the boundary. Anchor on the
boundary instead. That's where the next category sits.

## Where we are different from the cluster

There is now a small cluster of companies pointing at adjacent versions
of this problem. Tracehold focuses on cloud/ops agent guardrails and
task-scoped credentials. GuardPlane pushes lower, into endpoint and syscall
control for coding/desktop agents. AgentID frames itself as a governance
layer with observability and audit. Repello, Guardion, and others cluster
around real-time chat-style guardrails.

We are not "AI agent security." We are the **trust layer between any
autonomous system and any real-world action**. Agents, robots, smart home,
industrial, healthcare, mobility, workflows. The wedge is broader because
the problem is broader. Most of the cluster is also closed source. Sanctum
is MIT.

## The shape of what we shipped

- **Sixteen framework adapters.** LangChain, Vercel AI SDK, OpenAI Agents,
  Mastra, MCP, CrewAI, ROS2, Claude Desktop, n8n / Zapier / Make, AutoGen,
  Pydantic AI, LlamaIndex, smolagents, AWS Bedrock Agents, Browser-use,
  Home Assistant. Plus a generic `gate()` for everything else.

- **HMAC-signed action tokens** with explicit actor, action, org, audit id,
  correlation, expiry. The executor verifies before the side effect runs.

- **Blast-radius scoring** that includes monetary impact, data sensitivity
  classification, reversibility, physical-world effect, external
  destination, credential scope. Surfaced on the operator's screen in two
  seconds.

- **Source-trust classification** with seven levels. Untrusted content and
  tool output deterministically up-rank the verification requirement. The
  model can be wrong about its own context; the boundary cannot.

- **Dual approver + auto-escalate.** Two distinct humans for critical
  actions. Stale verifications re-push to all org members.

- **Fleet kill switch.** Operator-triggered org-wide pause. Mobile
  accessible. Audited.

- **Policy replay.** Run today's policy set against the last N audit
  entries; see which decisions would have changed. Safe rollout, regression
  test, compliance evidence in one.

- **NIST AI RMF + SOC2 evidence exports.** Sixteen mapped controls across
  GOVERN, MAP, MEASURE, MANAGE — with implementation evidence drawn from
  the actual runtime data.

- **Five domain policy packs** installable from the marketplace:
  `healthcare-phi-safety`, `finance-transfer-safety`, `robotics-ros2-safety`,
  `mcp-tools-baseline`, `claude-desktop-safety`.

- **Causal chain timeline.** Walk any audit entry back to its root cause and
  forward to its descendants. Click-to-pivot investigation in the dashboard.

- **Workflow builder.** Visual policy composition with live simulation
  against sample contexts — see decision, risk, blast radius, source trust,
  and anomalies before saving.

## Try it

```bash
npm install @sanctum-runtime/sdk @sanctum-runtime/adapters
docker run -p 8080:8080 sanctum/runtime
```

GitHub: <https://github.com/Matik103/sanctum-runtime>
Landing: [docs/landing.md](../landing.md)
Domain examples:
[Healthcare PHI](../examples/healthcare-phi.md) ·
[Finance transfers](../examples/finance-transfers.md) ·
[Robotics / ROS2](../examples/robotics-ros2.md) ·
[MCP tool servers](../examples/mcp-tools.md)

MIT. Open core. Local-first.
