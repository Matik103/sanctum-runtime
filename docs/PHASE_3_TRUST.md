# Phase 3 — Trust, attestation, and edge modes

Runtime attestation and trust scoring for the Sanctum control plane. This is **infrastructure Phase 3** from [CONTROL_PLANE.md](./CONTROL_PLANE.md) (not the older operator-loop guide in `PHASE_3.md` at repo root).

## What ships in this phase

| Capability | Status |
|------------|--------|
| Host attestation on `connect()` | Done |
| Trust score (0–100) | Done |
| `verified` / `limited` / `unverified` status | Done |
| HMAC attestation token (badge) | Done |
| `runtime.attested` events | Done |
| Fleet “Verified” badge | Done |
| Re-attest endpoint | Done |
| TPM / hardware attestation | **Done** | [PHASE_3_HARDWARE.md](./PHASE_3_HARDWARE.md) |
| Encrypted agent memory | **Done** | See [PHASE_3_MEMORY.md](./PHASE_3_MEMORY.md) |

## Connect with attestation

The TypeScript SDK sends a default report automatically (`platform`, `arch`, `hostname`, `sdkVersion`):

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const runtime = new SanctumRuntime({ baseUrl, apiKey })
const conn = await runtime.connect({
  runtimeName: 'edge-robot-01',
  organizationId: 'acme',
  mode: 'edge',
})

console.log(conn.trustScore, conn.attestationStatus, conn.attestationToken)
```

Disable attestation: `connect({ ..., attest: false })`.

## API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/runtimes/connect` | Connect; body may include `attestation` |
| POST | `/v1/runtimes/:id/attest` | Re-evaluate trust |
| GET | `/v1/runtimes/:id/trust` | Trust details for dashboard / tools |

Connect response fields: `trustScore`, `attestationStatus`, `attestationToken`.

## Trust scoring (MVP)

- Starts at 100, deducts for missing report fields or weak fingerprint
- `edge` −5, `hybrid` −8, `airgap` −15 (often **limited** even with good score)
- Score &lt; 60 → **unverified**; score &lt; 85 or airgap → **limited**; else **verified**

## Database

Migration `014_phase3_attestation.sql`:

- `attestation_status`, `attestation_report`, `attestation_token`, `attested_at`

Apply: `npm run db:push`

## Production env

Optional `SANCTUM_ATTESTATION_SECRET` (≥16 chars) for HMAC tokens. If unset, derived from `SUPABASE_SERVICE_ROLE_KEY` (same pattern as API key pepper).

## Next (Phase 3+)

- Hardware attestation (TPM quote verification)
- Policy gates on `attestation_status === 'verified'`
- Key rotation / re-wrap API
