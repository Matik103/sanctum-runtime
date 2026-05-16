# Sanctum Control Plane Architecture

> Infrastructure trust and orchestration for embodied AI — not another chatbot platform.

## System map

```text
┌─────────────────────────────────────────────────────────────┐
│  Sanctum Cloud Control Plane (hosted)                        │
│  auth · orgs · policies · runtime registry · events · UI     │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS (+ SSE stream)
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Robot / edge        AI agent host      Local container
   sanctum-runtime     @sanctum-runtime/sdk   pip install sanctum-runtime
```

---

## Phase status (gap matrix)

| Capability | Phase | Status | Notes |
|------------|-------|--------|-------|
| Auth (operator / enterprise) | 1 | **Done** | Supabase, portal types |
| Organizations | 1 | **Done** | `organizations`, domain join |
| API keys | 1 | **Done** | Create/revoke in Devices |
| Policy engine | 2 | **Done** | verify / approve / block |
| Audit log | 2 | **Done** | API + optional Supabase |
| **Runtime registration** | 1 | **Done** | `POST /v1/runtimes/connect` |
| **Heartbeat / telemetry** | 1 | **Done** | `POST …/heartbeat` every 30s |
| **Agent registration** | 2 | **Done** | `registerAgent()` |
| **Event stream** | 2 | **Done** | `runtime_events` + `emitEvent()` |
| **Fleet dashboard** | 1 | **Done** | Fleet page (runtimes/agents/events) |
| Live SSE | 1 | **Done** | `GET /v1/events/stream` |
| Auto `policy.*` on verify | 2 | **Done** | SDK emits when connected |
| WebSocket (bidirectional) | 2 | **Done** | `WS /v1/runtimes/ws` + SDK auto-connect |
| Usage metering | 4 | **Done** | `GET /v1/usage` |
| Billing (Stripe) | 4 | Planned | Enterprise |
| Runtime attestation / trust score | 3 | **Done** | `connect()` + `014_phase3_attestation` |
| Re-attest + trust API | 3 | **Done** | `POST …/attest`, `GET …/trust` |
| Fleet verified badge | 3 | **Done** | Fleet runtimes tab |
| Encrypted memory | 3 | **Done** | `runtime.memory(agentId)` |
| TPM / hardware quotes | 3 | Stub | `stubHardwareQuote()` |
| Fleet maps / regions | 4 | **Done** | `GET /v1/fleet/map` |
| Command dispatch | 4 | **Done** | heartbeat delivery + ack |
| Deployment groups | 4 | **Done** | `deployment_groups` table |
| Runtime marketplace | 4 | **Done** | Catalog + install + `connectFromPackage` |

---

## Phase 1 — Connect a runtime (MVP)

### Node / TypeScript

```bash
npm install @sanctum-runtime/sdk
```

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const runtime = new SanctumRuntime({
  baseUrl: process.env.SANCTUM_API_URL,
  apiKey: process.env.SANCTUM_API_KEY,
})

const { runtimeId } = await runtime.connect({
  runtimeName: 'warehouse-bot-01',
  organizationId: 'acme-factory', // created automatically if new
  mode: 'cloud',
  activeModel: 'gpt-4o-mini',
  metadata: { region: 'us-west', hostname: 'edge-01' },
})

await runtime.registerAgent({
  id: 'agent_navigation',
  model: 'gpt-4o',
  permissions: ['camera_access', 'movement'],
})

await runtime.emitEvent('agent.started', { task: 'patrol' }, 'agent_navigation')

// Gate actions as before
await runtime.verifyAction({
  actor: 'agent_navigation',
  action: 'unlock_door',
  context: { location: 'bay-3' },
})
```

### Python

```bash
pip install sanctum-runtime
```

```python
from sanctum_runtime import SanctumRuntime

runtime = SanctumRuntime()
session = runtime.connect(
    runtime_name="warehouse-bot-01",
    organization_id="acme-factory",
    mode="cloud",
)
runtime.register_agent(id="agent_navigation", model="gpt-4o", permissions=["movement"])
runtime.emit_event("agent.started", {"task": "patrol"}, agent_id="agent_navigation")
```

### API reference (control plane)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/runtimes/connect` | Register / reconnect + attestation |
| POST | `/v1/runtimes/:id/attest` | Re-evaluate trust |
| GET | `/v1/runtimes/:id/trust` | Trust score and report |
| POST | `/v1/runtimes/:id/heartbeat` | Telemetry + online status |
| POST | `/v1/runtimes/:id/agents` | Register agent on runtime |
| POST | `/v1/runtimes/:id/events` | Emit event |
| GET | `/v1/runtimes` | List runtimes (dashboard) |
| GET | `/v1/agents` | List agents |
| GET | `/v1/events` | Recent events |
| GET | `/v1/events/stream` | SSE live stream |
| GET | `/v1/fleet/map` | Regional fleet overview |
| GET/POST | `/v1/deployment-groups` | Clusters |
| POST | `/v1/orchestration/dispatch` | Queue commands to runtimes |
| POST | `/v1/commands/:id/ack` | Runtime acks delivery |

Auth: `X-Sanctum-Key` (scripts) or Supabase JWT (dashboard).

---

## Runtime modes

| Mode | Use case |
|------|----------|
| `cloud` | Full telemetry + policies from control plane |
| `edge` | Local inference, cloud sync |
| `airgap` | No internet; policies bundled locally |
| `hybrid` | Local model + cloud policies |

Pass `mode` on `connect()`.

---

## Event types (conventions)

| Event | When |
|-------|------|
| `runtime.connected` | Auto on connect |
| `runtime.attested` | Auto after trust evaluation |
| `agent.registered` | Auto on registerAgent |
| `agent.started` | Your agent loop |
| `policy.blocked` | After BLOCKED decision |
| `command.executed` | After approved action runs |
| `operator.override` | Manual dashboard resolve |
| `memory.updated` | Encrypted memory PUT |
| `memory.deleted` | Encrypted memory DELETE |

Emit custom types with `emitEvent()`.

---

## Enterprise org layout

```text
Tesla (org_id: tesla)
 ├── Factory Cluster A   (metadata.cluster)
 ├── Security Robots
 └── Delivery Fleet
```

Map `organizationId` on connect. Add rows in `organization_domains` for SSO auto-join.

---

## Database (Supabase)

Migration `010_control_plane.sql`:

- `registered_runtimes`
- `registered_agents`
- `runtime_events`

Apply: `npm run db:push`

---

## What’s next

1. **You:** Run `examples/runtime-connect/run.ts` against production API.
2. **Dashboard:** Fleet → see runtime online, agents, events.
3. **Phase 2:** WebSocket; org filter on Fleet; deployment groups UI.
4. **Phase 3:** Attestation, hardware fingerprint, trust certification.
5. **Phase 4:** Fleet map, dispatch — [PHASE_4_ORCHESTRATION.md](./PHASE_4_ORCHESTRATION.md).

See also [PHASE_3_TRUST.md](./PHASE_3_TRUST.md) · [PHASE_3.md](../PHASE_3.md) (operator loop) · [PRODUCTION_OPS.md](../PRODUCTION_OPS.md).
