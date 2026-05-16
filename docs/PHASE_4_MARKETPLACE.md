# Runtime marketplace

Catalog of runtime templates with one-click org install and SDK `connectFromPackage()`.

## Catalog (seeded)

| Slug | Category | Mode |
|------|----------|------|
| `sanctum-agent-host` | agent-host | cloud |
| `warehouse-robot` | robotics | edge |
| `edge-sensor-gateway` | edge | hybrid |

Apply migration `017_runtime_marketplace.sql` via `npm run db:push`.

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
