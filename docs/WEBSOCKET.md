# Runtime WebSocket channel

Bidirectional control-plane channel for **instant command delivery** to connected runtimes.

## Endpoint

```
WS /v1/runtimes/ws?runtimeId=<uuid>
```

Headers (same as REST):

- `X-Sanctum-Key: sk_sanctum_…` (scripts / runtimes)
- `Authorization: Bearer <jwt>` (dashboard tools)

## Server → runtime messages

```json
{ "type": "connected", "runtimeId": "…" }
{ "type": "command", "id": "…", "command": "ping", "payload": {} }
```

## Runtime → server

```json
{ "type": "ping" }
```

Response: `{ "type": "pong" }`

Acknowledge command execution via `POST /v1/commands/:id/ack` (SDK does this automatically).

## SDK

WebSocket is enabled by default after `connect()`:

```ts
await runtime.connect({
  runtimeName: 'bot-01',
  organizationId: 'acme',
  onCommand: async (cmd) => console.log(cmd.command),
})
```

## Dispatch path

1. `POST /v1/orchestration/dispatch` inserts `runtime_commands` rows.
2. If the runtime has an active WebSocket, the command is pushed immediately and marked `delivered`.
3. Otherwise the next heartbeat claims pending commands.

`GET /health` includes `wsConnections` for ops.
