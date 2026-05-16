# Runtime marketplace

Catalog of runtime templates with one-click org install and SDK `connectFromPackage()`.

## Catalog (seeded)

| Slug | Category | Mode | Primary agent | Policies on install |
|------|----------|------|---------------|---------------------|
| `sanctum-agent-host` | agent-host | cloud | `default_agent` | `send_email`, `delete_file`, `execute_terminal`, `access_database` |
| `warehouse-robot` | robotics | edge | `navigation` | `move_robot`, `unlock_door`, `disable_alarm` |
| `edge-sensor-gateway` | edge | hybrid | `telemetry` | `disable_alarm`, `access_database` |

Apply migrations `017` + `020` via `npm run db:push`.

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
