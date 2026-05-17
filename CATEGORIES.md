# One runtime, many categories (OSS)

Sanctum is **not** an “agents-only” tool. It is a **category-agnostic action gate**: anything that can propose a real-world or production side effect can call the same API.

```text
  Your stack (any category)  →  verifyAction(action, context)  →  approve | verify | block
```

**What ships in OSS today:** the full runtime (API, SDK, policies, audit, webhooks, dashboard) plus the **agent adapter** (`protectAgent`). Other categories use the **same SDK** with your own `action` names — no separate product fork.

**What stays outside this repo:** hosted fleet control, proprietary threat intelligence, and compliance packs — see [OPEN_CORE.md](./OPEN_CORE.md).

---

## 12 categories — same core, your action names

| # | Category | Example `action` values (you define) | Example `context` |
|---|----------|--------------------------------------|-------------------|
| 1 | **AI agents** | `send_email`, `delete_file`, `execute_terminal` | `heard`, `intent`, tool args |
| 2 | **Humanoids** | `unlock_door`, `move_to_location`, `handover_object` | `location`, `owner_sleeping`, `time` |
| 3 | **Embodied AI** | `move_robot`, `grasp`, `release_payload` | `zone`, `speed`, `near_human` |
| 4 | **Smart home** | `unlock_door`, `disable_alarm`, `set thermostat` | `device_id`, `room`, `user_home` |
| 5 | **AI operating systems** | `delete_file`, `install_package`, `kill_process` | `path`, `privilege`, `user_id` |
| 6 | **Robotics integrators** | `navigate`, `dock`, `calibrate_arm` | `map_id`, `battery_pct`, `sensor_flags` |
| 7 | **Workflow / automation** | `run_workflow`, `post_slack`, `update_crm` | `workflow_id`, `tenant`, `trigger` |
| 8 | **Physical security / edge** | `open_gate`, `arm_perimeter`, `stream_camera` | `site_id`, `operator`, `offline` |
| 9 | **Healthcare robotics** | `dispense`, `move_bed`, `access_record` | `patient_zone`, `role`, `policy_id` |
| 10 | **Autonomous mobility** | `change_route`, `engage_mode`, `open_door` | `route_id`, `occupancy`, `weather` |
| 11 | **AI companions** | `send_message`, `store_memory`, `place_order` | `channel`, `user_id`, `consent` |
| 12 | **Industrial automation** | `emergency_stop`, `start_line`, `adjust_setpoint` | `line_id`, `shift`, `safety_interlock` |

Default policies in the repo already cover several physical and agent actions (`unlock_door`, `move_robot`, `disable_alarm`, …). Add yours with `registerPolicy()` or YAML import.

### Marketplace templates (hosted catalog)

After `npm run db:push` (migrations `017`–`022`), each category has a **primary** installable package in the dashboard Marketplace:

| # | Category | Primary slug |
|---|----------|--------------|
| 1 | AI agents | `sanctum-agent-host` (+ `langchain-agent-host`, `mcp-server-host`) |
| 2 | Humanoids | `humanoid-host` |
| 3 | Embodied AI | `embodied-ai-host` |
| 4 | Smart home | `smart-home-hub` |
| 5 | AI operating systems | `ai-os-host` |
| 6 | Robotics integrators | `warehouse-robot`, `ros2-mobile` |
| 7 | Workflow / automation | `crewai-crew-host`, `finance-agent` |
| 8 | Physical security / edge | `edge-sensor-gateway` |
| 9 | Healthcare robotics | `healthcare-host` |
| 10 | Autonomous mobility | `mobility-host` |
| 11 | AI companions | `companion-host` |
| 12 | Industrial automation | `industrial-host` |

See [docs/PHASE_4_MARKETPLACE.md](./docs/PHASE_4_MARKETPLACE.md) and `examples/marketplace-connect/`.

---

## Integration pattern (every category)

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const sanctum = new SanctumRuntime({ baseUrl: process.env.SANCTUM_API_URL! })

const result = await sanctum.verifyAction({
  actor: 'nav-stack-v2',
  action: 'move_to_pallet',        // your category-specific name
  context: {
    zone: 'warehouse',
    heard: 'Move to aisle 4',
    org_id: 'acme',                // optional org-scoped policies
  },
})

if (result.decision === 'APPROVED') {
  await executeMotion()
}
```

**Agents** can additionally use:

```ts
import { protectAgent } from '@sanctum-runtime/adapter-agent-runtime'
```

**Robotics / device hosts** can use `sanctum.runtime().attach(host)` when the host exposes `onAction` (see SDK middleware).

---

## Roadmap (public)

| Layer | Status |
|-------|--------|
| Core verify + policy + audit | **Available (OSS)** |
| Agent adapter + dashboard | **Available (OSS)** |
| Category-specific adapters (ROS2 helpers, smart-home presets, …) | **Community / phased** — same repo pattern as `packages/adapters/agent-runtime` |
| Category-tuned dashboard modules | **Phased** — shared shell, different views per segment |

Contributors: pick a category, define action schemas and an example under `examples/`, open a PR. See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Search terms by category

If you build in one of these spaces, Sanctum is meant to show up for you:

- AI agents · LLM tool use · MCP tools · function calling safety  
- Humanoid robots · embodied AI · manipulation safety  
- Smart home · IoT locks · home automation AI  
- ROS2 · mobile robots · warehouse AMR  
- Industrial PLC · factory automation · emergency stop governance  
- Autonomous vehicles · fleet command approval (self-hosted OSS gate)  
- Workflow automation · Zapier-style AI · enterprise bots (policy + audit in **your** infra)

---

## Docs

- [START_HERE.md](./START_HERE.md) — run locally  
- [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) — API & SDK reference  
- [examples/policies.example.yaml](./examples/policies.example.yaml) — sample policies across actions
