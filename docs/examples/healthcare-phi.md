# Healthcare PHI safety with Sanctum

Use Sanctum to make sure no AI agent — your charting copilot, your scheduling
bot, your patient-portal helper — can send, export, or share Protected Health
Information without an explicit human signoff.

## Why this matters

HIPAA § 164.312 requires access controls, audit controls, and integrity
controls on every system handling PHI. An LLM that decides to email a chart,
copy a record into a doc, or fan out a discharge summary fails every one of
those if there's no boundary between "model decided" and "action ran".

Sanctum is that boundary.

## Install the policy pack

The `healthcare-phi-safety` marketplace pack ships pre-tuned policies for
the actions agents typically reach for in clinical settings. Install it from
the Marketplace page in the dashboard, or apply directly:

```bash
curl -X POST $SANCTUM_API/v1/marketplace/install \
  -H "X-Sanctum-Key: $SANCTUM_API_KEY" \
  -d '{ "slug": "healthcare-phi-safety", "orgId": "your-org" }'
```

What it does:

- `export_patient_data` → **auto-block** unless an authorized covered entity flow approves
- `send_medical_record` → require operator verification, **block when offline**
- `access_phi` → require verification with provenance (treatment / payment / operations)
- `delete_patient_record` → **auto-block** (retention requirement)
- `share_health_data` → require verification, block when offline

## Wire it into your agent

```ts
import { SanctumClient } from '@sanctum-runtime/sdk'
import { wrapLangChainTool } from '@sanctum-runtime/adapters'

const sanctum = new SanctumClient({ baseUrl: process.env.SANCTUM_API })

const sendChart = wrapLangChainTool(rawSendChartTool, {
  client: sanctum,
  agentId: `clinic:${userId}`,
})
```

Any call to `sendChart` now goes through Sanctum first. If the policy says
verify, the operator sees the request in the dashboard or on their phone
push notification. On approval, Sanctum returns a signed action token your
executor must verify before the email actually leaves.

## What you get for the audit

Every PHI-touching call is recorded with:

- actor identity (provider, role, session)
- blast radius (`dataSensitivity: regulated`, factor `PHI`)
- source trust (was the prompt from the doctor, or from a patient-portal field?)
- approval provenance (who approved, when, dual-approver if policy requires)
- signed action token (proves the executor actually had permission)

Export the full evidence bundle from the **Assurance → Evidence Export** page —
JSON suitable for HIPAA risk assessment review.

## NIST AI RMF mapping

The `claude-desktop-safety` and `healthcare-phi-safety` packs together cover:

- **GOVERN 1.2** — Roles and responsibilities (operator approval, resolver attribution)
- **MAP 2.3** — Harm categories (regulated data, irreversibility, external destination)
- **MEASURE 2.2** — Anomaly detection (PHI flow anomalies surfaced to operators)
- **MANAGE 2.4** — Action token provenance (executor must verify before side effect)
