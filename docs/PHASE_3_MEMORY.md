# Encrypted agent memory

Zero-knowledge memory vault: the control plane stores **ciphertext only**. Decryption keys stay on the runtime host.

## Setup

```bash
export SANCTUM_MEMORY_KEY="your-long-local-secret-at-least-16-chars"
```

Never commit this key. Rotate by re-encrypting entries with a new key (future: key rotation API).

## SDK

```ts
import { SanctumRuntime } from '@sanctum-runtime/sdk'

const runtime = new SanctumRuntime({ baseUrl, apiKey })
await runtime.connect({ runtimeName: 'bot-01', organizationId: 'acme' })
await runtime.registerAgent({ id: 'agent_nav' })

const mem = runtime.memory('agent_nav')
await mem.set('waypoints', [{ x: 1, y: 2 }])
const waypoints = await mem.get<{ x: number; y: number }[]>('waypoints')
await mem.delete('waypoints')
const keys = await mem.list()
```

Encryption: **AES-256-GCM**, key derived via scrypt from `SANCTUM_MEMORY_KEY` + per-agent salt.

## API (advanced)

| Method | Path |
|--------|------|
| GET | `/v1/runtimes/:runtimeId/agents/:agentId/memory` |
| GET | `…/memory/:key` |
| PUT | `…/memory/:key` — body `{ ciphertext, iv, algorithm?, keyHint? }` |
| DELETE | `…/memory/:key` |

Events: `memory.updated`, `memory.deleted`.

## Database

`016_agent_memory.sql` — `agent_memory_entries` table. Apply: `npm run db:push`.
