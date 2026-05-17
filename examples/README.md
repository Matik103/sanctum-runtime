# Sanctum examples (open source)

Runnable samples for the **public** runtime. Requires the API from this monorepo.

```bash
# Terminal 1
npm run dev:runtime

# Terminal 2
npm run example:agent
```

| Example | Command | What it shows |
|---------|---------|----------------|
| **agent-gate** | `npm run example:agent` | `protectAgent()` — verify before execute |
| **marketplace** | `npm run example:marketplace` | Install + connect any catalog slug (`SANCTUM_PACKAGE=…`) |
| **marketplace:smart-home** | `npm run example:marketplace:smart-home` | `smart-home-hub` template |
| **marketplace:ros2** | `npm run example:marketplace:ros2` | `ros2-mobile` template |
| **marketplace:finance** | `npm run example:marketplace:finance` | `finance-agent` template |
| **marketplace:langchain** | `npm run example:marketplace:langchain` | `langchain-agent-host` template |
| **marketplace:crewai** | `npm run example:marketplace:crewai` | `crewai-crew-host` template |
| **marketplace:mcp** | `npm run example:marketplace:mcp` | `mcp-server-host` template |

Enterprise scenarios (fleet sync, hosted cloud) are not included here — see [OPEN_CORE.md](../OPEN_CORE.md).
