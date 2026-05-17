# Runtime marketplace

Catalog of runtime templates with one-click org install and SDK `connectFromPackage()`.

## Catalog (seeded)

| Slug | Category | Mode | Primary agent | Example |
|------|----------|------|---------------|---------|
| `sanctum-agent-host` | agent-host | cloud | `default_agent` | `npm run example:marketplace` |
| `warehouse-robot` | robotics | edge | `navigation` | `SANCTUM_PACKAGE=warehouse-robot npm run example:marketplace` |
| `edge-sensor-gateway` | edge | hybrid | `telemetry` | `SANCTUM_PACKAGE=edge-sensor-gateway npm run example:marketplace` |
| `smart-home-hub` | smart-home | hybrid | `home_agent` | `npm run example:marketplace:smart-home` |
| `ros2-mobile` | robotics | edge | `ros2_controller` | `npm run example:marketplace:ros2` |
| `finance-agent` | automation | cloud | `treasury_agent` | `npm run example:marketplace:finance` |
| `langchain-agent-host` | agent-host | cloud | `langchain_agent` | `npm run example:marketplace:langchain` |
| `crewai-crew-host` | automation | cloud | `crew_agent` | `npm run example:marketplace:crewai` |
| `mcp-server-host` | agent-host | cloud | `mcp_host` | `npm run example:marketplace:mcp` |

Apply migrations `017`–`021` via `npm run db:push`.

**Install applies org-scoped policies** (`{orgId}:{action}`) and stores keys in the install record. **Uninstall removes** those policy keys.

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
