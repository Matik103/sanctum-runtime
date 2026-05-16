# GitHub discovery checklist (maintainers)

Use this so the repo ranks well on **GitHub search**, **Google**, and **npm** — without changing product behavior.

## Repository About (Settings → General)

**Description** (max 350 chars — paste as-is):

```text
Open-source trust layer for autonomous AI — gate agent, robot, smart home, and industrial actions before they run. Policies, HITL, Ollama/OpenAI, audit. MIT. npm @sanctum-runtime/sdk
```

**Website:** `https://github.com/Matik103/sanctum-runtime#readme`  
(or your marketing site when live)

**Topics** (add all 20 — GitHub limit):

```text
ai-agents
llm-security
agent-security
ai-safety
guardrails
policy-engine
human-in-the-loop
ollama
local-llm
autonomous-agents
tool-use
function-calling
ai-governance
audit-log
nodejs
typescript
open-source
middleware
robotics
ai-runtime
```

If swapping topics for category reach, prefer: `smart-home`, `iot`, `industrial-automation`, `humanoid-robotics`, `embodied-ai`, `ros2`

Do **not** mention enterprise fleet, proprietary intel, or hosted cloud as if they ship in this repo.

## Social preview

- **Settings → General → Social preview** — upload 1280×640 image with logo + tagline:  
  *“Gate AI agent actions before they execute”*

## README SEO (done in repo)

- First paragraph names the problem (agent actions, not chat-only).
- Sections: who it’s for, quick start, comparison table, FAQ-style search table.
- Links to START_HERE and DEVELOPER_GUIDE.

## npm (packages)

Keywords live in:

- `packages/sdk/package.json`
- `packages/adapters/agent-runtime/package.json`

Republish SDK when keywords change: `npm run publish:sdk`

## Issues & discussions

- Enable **GitHub Discussions** (optional) — category “Show and tell” for agent integrations.
- Pin a “Good first issue” labeled `help wanted` for stars → contributors funnel.

## External backlinks (manual)

Post once (don’t spam):

- Show HN / dev.to / X thread: “We open-sourced an action gate for AI agents”
- Add to awesome-ai-agents lists (PR to community repos)
- Link from npm package README (already points to GitHub)

## Do not

- Keyword-stuff hidden HTML or duplicate READMEs — GitHub penalizes noise.
- Promise enterprise features in OSS README — point to OPEN_CORE.md.
