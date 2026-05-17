# Runtime marketplace

Catalog of runtime templates with one-click org install and SDK `connectFromPackage()`.

## Twelve categories (primary catalog)

Each row in [CATEGORIES.md](../CATEGORIES.md) has a **primary** marketplace slug. Integration profiles share the same category where noted.

| # | Category | Primary slug | Also in category |
|---|----------|--------------|------------------|
| 1 | AI agents | `sanctum-agent-host` | `langchain-agent-host`, `mcp-server-host` |
| 2 | Humanoids | `humanoid-host` | — |
| 3 | Embodied AI | `embodied-ai-host` | — |
| 4 | Smart home | `smart-home-hub` | — |
| 5 | AI operating systems | `ai-os-host` | — |
| 6 | Robotics integrators | `warehouse-robot` | `ros2-mobile` |
| 7 | Workflow / automation | `crewai-crew-host` | `finance-agent` |
| 8 | Physical security / edge | `edge-sensor-gateway` | — |
| 9 | Healthcare robotics | `healthcare-host` | — |
| 10 | Autonomous mobility | `mobility-host` | — |
| 11 | AI companions | `companion-host` | — |
| 12 | Industrial automation | `industrial-host` | — |

Apply migrations `017`–`022` via `npm run db:push`.

**Install applies org-scoped policies** (`{orgId}:{action}`) from each package’s `policy_templates` and stores keys on the install record. **Uninstall removes** those policy keys.

## Full catalog

| Slug | Category | Example |
|------|----------|---------|
| `sanctum-agent-host` | ai-agents | `npm run example:marketplace` |
| `langchain-agent-host` | ai-agents | `npm run example:marketplace:langchain` |
| `mcp-server-host` | ai-agents | `npm run example:marketplace:mcp` |
| `humanoid-host` | humanoid | `npm run example:marketplace:humanoid` |
| `embodied-ai-host` | embodied | `npm run example:marketplace:embodied` |
| `smart-home-hub` | smart-home | `npm run example:marketplace:smart-home` |
| `ai-os-host` | ai-os | `npm run example:marketplace:ai-os` |
| `warehouse-robot` | robotics | `SANCTUM_PACKAGE=warehouse-robot npm run example:marketplace` |
| `ros2-mobile` | robotics | `npm run example:marketplace:ros2` |
| `crewai-crew-host` | automation | `npm run example:marketplace:crewai` |
| `finance-agent` | automation | `npm run example:marketplace:finance` |
| `edge-sensor-gateway` | edge | `SANCTUM_PACKAGE=edge-sensor-gateway npm run example:marketplace` |
| `healthcare-host` | healthcare | `npm run example:marketplace:healthcare` |
| `mobility-host` | mobility | `npm run example:marketplace:mobility` |
| `companion-host` | companion | `npm run example:marketplace:companion` |
| `industrial-host` | industrial | `npm run example:marketplace:industrial` |

Or set `SANCTUM_PACKAGE=<slug>` with `npm run example:marketplace`.

## Dashboard

**Marketplace** in the sidebar → pick org → **Install** → use SDK snippet on the card.

## SDK

```ts
const runtime = new SanctumRuntime({ baseUrl, apiKey })

// Install + connect + register template agents
const conn = await runtime.connectFromPackage('warehouse-robot', organizationId)

// Or manual flow
await runtime.marketplace.install('warehouse-robot', organizationId)
const { connect } = await runtime.marketplace.getConnectHints('warehouse-robot', organizationId)
await runtime.connect(runtime.marketplace.toConnectOptions(connect, organizationId))
```

## API

| Method | Path |
|--------|------|
| GET | `/v1/marketplace/packages?org_id=` |
| GET | `/v1/marketplace/packages/:slug` |
| POST | `/v1/marketplace/packages` — publish org package |
| POST | `/v1/marketplace/packages/:slug/install` |
| DELETE | `/v1/marketplace/packages/:slug/install?org_id=` |
| GET | `/v1/marketplace/packages/:slug/connect?org_id=` |

Events: `marketplace.installed`, `marketplace.uninstalled`.
