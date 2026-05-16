# Phase 4 — Fleet orchestration (MVP)

Deployment groups, regional fleet map, and command dispatch to runtimes via heartbeat.

## Capabilities

| Feature | Endpoint / API |
|---------|----------------|
| Deployment groups | `GET/POST /v1/deployment-groups` |
| Fleet map (regions + summary) | `GET /v1/fleet/map?org_id=` |
| Dispatch command | `POST /v1/orchestration/dispatch` |
| Deliver on heartbeat | `POST /v1/runtimes/:id/heartbeat` → `commands[]` |
| Ack command | `POST /v1/commands/:id/ack` |

## Connect with region

```ts
await runtime.connect({
  runtimeName: 'warehouse-bot-01',
  organizationId: 'acme',
  region: 'us-west',
  metadata: { cluster: 'factory-a' },
  onCommand: async (cmd) => {
    console.log('received', cmd.command, cmd.payload)
  },
})
```

Commands are auto-acked after `onCommand` succeeds; failed handlers mark the command `failed`.

## Dispatch from dashboard

Fleet → **Map** tab → select org → create **deployment groups**, assign runtimes on **Runtimes** tab, then **Dispatch command** (by group, region, or both).

## Dispatch from API

```bash
curl -X POST "$SANCTUM_API_URL/v1/orchestration/dispatch" \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "personal-…",
    "command": "reload_policies",
    "region": "us-west",
    "payload": { "reason": "ops" }
  }'
```

Targets: `runtimeId`, `deploymentGroupId`, or `region` (at least one required).

## Database

Migration `015_phase4_orchestration.sql` — apply with `npm run db:push`.

## WebSocket (instant delivery)

After `connect()`, the SDK opens `WS /v1/runtimes/ws?runtimeId=…` with `X-Sanctum-Key`. Commands are pushed immediately; heartbeat polling is the fallback when WS is unavailable.

Disable: `connect({ useWebSocket: false })`.

## Planned later
- Runtime marketplace
- Billing / usage metering
