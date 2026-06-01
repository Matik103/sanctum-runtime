# Sanctum Autonomy Infrastructure

Sanctum is the runtime trust layer for autonomous action. The product should
make one idea obvious in the first minute:

> AI can act in the real world without receiving unchecked power.

The platform already has the core primitives for this: SDK gating, Connect
Agent proxy gating, signed action tokens, source-trust classification, blast
radius scoring, Sanctum Shield, audit replay, and evidence summaries. This
document keeps product, engineering, and demos aligned around that future.

## Product Thesis

Sanctum controls the boundary where proposed AI action becomes permitted
real-world action.

Every meaningful action should answer:

- Who or what requested it?
- Which model, agent, tool, runtime, and environment were involved?
- What permission was requested?
- What scope and expiry were granted?
- What policy, Shield signal, and blast-radius score decided the outcome?
- Was a short-lived action token issued before execution?
- What evidence proves what happened afterward?

## Golden Path

The first-run experience should stay relentlessly simple:

1. Register or select an agent.
2. Choose a model provider.
3. Save a platform key or use the SDK.
4. Send one realistic risky action.
5. Watch Sanctum hold, block, or approve it live.
6. See the action passport, blast radius, source trust, and token boundary.
7. Open Live Feed, Shield, replay, or evidence from the same flow.

This is the product's "wow" moment. Everything else should support it.

## Product Surfaces

| Surface | Job |
| --- | --- |
| Overview | Explain the runtime trust boundary and let users simulate risky actions safely. |
| Connect Agent | No-SDK proxy path: choose agent, provider, key, mode, and code snippet. |
| Live Feed | Real-time action control: approve, block, set per-tool policy, inspect passport. |
| Sanctum Shield | Early-warning behavior detection and containment. |
| Policies | Explicit rules for approve, verify, block, source trust, and blast radius. |
| Workflow Builder | Visual policy authoring and simulation. |
| Assurance | Replay historical actions against current policy and export evidence. |
| Mobile PWA | Urgent approvals, push alerts, incident triage, and fleet pause. |

## What We Should Not Overthink

- Do not build separate safety concepts for each model vendor. Sanctum controls
  actions, not chat history.
- Do not hide powerful primitives behind tables. Make action identity, blast
  radius, replay, Shield, and tokens visible wherever decisions happen.
- Do not make every page a configuration page. The product should guide users
  from "connect" to "intercept" to "enforce" to "prove."

## What Creates Enterprise Value

- Action tokens make approvals enforceable infrastructure.
- Replay lets teams roll out policy safely in shadow mode.
- Evidence summaries convert runtime decisions into SOC 2 / NIST AI RMF proof.
- Shield turns suspicious behavior into automatic containment.
- Connect Agent lowers adoption friction for teams that cannot change SDK code.

## Demo Standard

Any production demo should prove both SDK and Connect paths:

```text
agent proposes risky action
Sanctum derives action identity
Sanctum scores source trust and blast radius
policy + Shield decide
operator approves/denies when required
approved actions receive a short-lived action token
executor reports the result
audit/replay/evidence show the chain
```

When this sequence is visible, Sanctum feels like autonomy infrastructure rather
than another monitoring dashboard.
