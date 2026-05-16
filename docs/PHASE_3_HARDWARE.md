# Hardware attestation (TPM / software-sealed)

Challenge-response quotes bind runtimes to a fresh nonce. Verified hardware boosts trust score (+12) and can upgrade `limited` → `verified` on edge hosts.

## Flow

1. `GET /v1/attestation/challenge?org_id=` → `{ challengeId, nonce, expiresAt, softwareSealedQuote }`
2. Runtime includes quote in `connect()` attestation:

```json
{
  "platform": "linux",
  "hardware": {
    "type": "software-sealed",
    "challengeId": "...",
    "nonce": "...",
    "quote": "..."
  }
}
```

3. Server consumes challenge (single-use), verifies HMAC quote, stores `hardwareVerified` on attestation report.

## Modes

| Type | Quote material |
|------|----------------|
| `software-sealed` | `HMAC(secret, challengeId:nonce)` — SDK default |
| `tpm2` | `HMAC(secret, challengeId:nonce:pcr0=…;pcr1=…)` — supply PCR map |
| `sgx` | Same as tpm2 (PCR-style binding) |

Real TPM2 agents should compute the same HMAC over PCRs from the challenge nonce.

## SDK

Hardware attestation is **on by default** when `attest` is true:

```ts
await runtime.connect({
  runtimeName: 'edge-01',
  organizationId: 'acme',
  mode: 'edge',
  hardwareAttest: true, // default
})
// connect result includes hardwareVerified
```

Disable: `connect({ hardwareAttest: false })`.

Manual TPM:

```ts
import { fetchAttestationChallenge, buildTpm2Hardware } from '@sanctum-runtime/sdk'

const ch = await fetchAttestationChallenge(client, orgId)
const hardware = buildTpm2Hardware(ch, tpmQuoteFromDevice, { '0': pcr0, '7': pcr7 })
```

## Database

`019_hardware_attestation.sql` — `attestation_challenges` table.

## Fleet

Runtimes with verified hardware show an **HW** badge next to trust status.
