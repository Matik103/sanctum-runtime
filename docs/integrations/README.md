# Integration guides

Verify **before** tool execution — same pattern for every framework.

## Framework adapters

`@sanctum-runtime/adapters` ships duck-typed wrappers for 16 frameworks. No
peer-dep install required — the adapter doesn't import the framework, it
matches its shape.

| Adapter            | Stack                                                                     | Import                                              |
| ------------------ | ------------------------------------------------------------------------- | --------------------------------------------------- |
| LangChain          | JS/Python agents with `Tool` objects                                      | `@sanctum-runtime/adapters/langchain`               |
| Vercel AI SDK      | `tool()` / `streamText({ tools })`                                        | `@sanctum-runtime/adapters/vercel-ai`               |
| OpenAI Agents SDK  | `Agent({ tools })` function tools                                         | `@sanctum-runtime/adapters/openai-agents`           |
| Mastra             | Mastra workflow tools                                                      | `@sanctum-runtime/adapters/mastra`                  |
| MCP                | `@modelcontextprotocol/sdk` server tools                                   | `@sanctum-runtime/adapters/mcp`                     |
| CrewAI             | run() / _run() tool objects                                                | `@sanctum-runtime/adapters/crewai`                  |
| ROS2               | publishers, service clients, action clients                                | `@sanctum-runtime/adapters/ros2`                    |
| Claude Desktop     | `tool_use` blocks from computer-use                                        | `@sanctum-runtime/adapters/claude-desktop`          |
| n8n / Zapier / Make| Code/Function nodes in workflow automation                                 | `@sanctum-runtime/adapters/n8n`                     |
| Microsoft AutoGen  | FunctionTool + GroupChatManager hook                                       | `@sanctum-runtime/adapters/autogen`                 |
| Pydantic AI        | HTTP bridge to TS-side dispatchers                                         | `@sanctum-runtime/adapters/pydantic-ai`             |
| LlamaIndex         | `FunctionTool` / `QueryEngineTool`                                         | `@sanctum-runtime/adapters/llamaindex`              |
| smolagents         | HTTP bridge to TS-side runners                                             | `@sanctum-runtime/adapters/smolagents`              |
| AWS Bedrock Agents | Action-group Lambda handlers                                               | `@sanctum-runtime/adapters/bedrock-agents`          |
| Browser-use / Stagehand | Browser-automation primitive executors                                  | `@sanctum-runtime/adapters/browser-use`             |
| Home Assistant     | `domain.service(entity_id, data)` calls                                    | `@sanctum-runtime/adapters/home-assistant`          |
| Model tool dispatch| OpenAI, Claude, Gemini, Grok, DeepSeek, NVIDIA NIM and compatible APIs      | `@sanctum-runtime/adapters/model-tools`              |
| **Generic**        | Anything else — wrap your own dispatcher                                   | `@sanctum-runtime/adapters` → `gate()`              |

## Choose your connection path

| Path | Best for | Credentials | Result |
| ---- | -------- | ----------- | ------ |
| **Easy Connect** | Model tool dispatchers and MCP tool servers | Registered agent token | One guided wrapper at the execute boundary |
| **SDK + adapters** | Production agents, devices, robotics, workflows and fleets | Agent token and/or runtime API key | Full telemetry, runtime registration, policy and action-token workflows |

The console **Agents** page exposes both paths. Easy Connect covers any model
provider that gives your application a tool/function execution hook; it does
not claim access to unconnected consumer chat sessions.

## Domain example walkthroughs

Real-world, end-to-end:

- [Healthcare PHI safety](../examples/healthcare-phi.md) — HIPAA-aligned PHI controls + audit
- [Finance transfers](../examples/finance-transfers.md) — wire / invoice / refund / trade with dual approver
- [Robotics / ROS2](../examples/robotics-ros2.md) — physical-world safety, ISO 10218 mapping
- [MCP tool servers](../examples/mcp-tools.md) — gate `@modelcontextprotocol/server-*` calls
- [Provider-neutral model tools](./model-tools.md) — gate function calls from hosted or local models

## Older single-file guides

| Guide | Stack |
|-------|--------|
| [LangChain](./langchain.md) | Python / JS agents with tools |
| [CrewAI](./crewai.md) | Multi-agent crews |
| [MCP](./mcp.md) | Model Context Protocol servers |

**Prerequisites:** Running Sanctum API (`SANCTUM_API_URL`) and a policy for your action (dashboard **Policies** or YAML import).

**SDKs:** [`@sanctum-runtime/sdk`](https://www.npmjs.com/package/@sanctum-runtime/sdk) · [`sanctum-runtime` on PyPI](../../packages/python-sdk/README.md)
