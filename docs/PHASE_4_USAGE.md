# Usage metering

Org-scoped usage events for the control plane — precursor to enterprise billing.

## Metrics

| Metric | When recorded |
|--------|----------------|
| `runtime.connect` | Runtime registers |
| `agent.register` | Agent registered |
| `action.verify` | `POST /v1/actions/verify` (needs `org_id` in context) |
| `command.dispatch` | Orchestration dispatch (quantity = target count) |
| `marketplace.install` | Package installed |
| `memory.write` | Encrypted memory PUT |

## API

```
GET /v1/usage?org_id=acme&days=30
```

Returns `{ totals, daily, from, to, periodDays }`.

## Dashboard

**Settings → Usage (30 days)** — totals per metric for selected org.

## Database

`018_usage_metering.sql` — `usage_events` table. Apply: `npm run db:push`.

## Planned

- Stripe / invoice integration
- Quotas and plan tiers
- Usage alerts
