# Tier 2 Post #5 — AI Agent Tool Calling Best Practices

**Article:** [AI Agent Tool Calling Best Practices for Production (2026)](https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling)  
**GSC priority:** Tier 2 #5 (highest impressions + deep content refresh)  
**Series position:** Tier 2 Day 5 (after guardrails vs runtime — tool wrapper patterns at scale)

**Images:**
- `public/marketing/linkedin-tool-calling-tier2-day5-1200x627.png` (LinkedIn feed / Twitter)
- `public/marketing/linkedin-tool-calling-tier2-day5-1080x1350.png` (LinkedIn portrait)
- `public/marketing/linkedin-tool-calling-tier2-day5-source.png` (master source — not produced by `scripts/build-linkedin-post-image.py`; header-safe, no crop)

**Alt text (short):**
```
Sanctum Runtime infographic: your agent has 23 tools but half bypass your security layer. Flow compares unprotected immediate execution vs protected verifyAction path with approve verify or block. Five-item production tool calling checklist on the right.
```

**Alt text (recommended):**
```
Sanctum Runtime infographic on dark navy background titled "Your agent has 23 tools. Half of them bypass your security layer." Left side flowchart: agent selects tool, split between red unprotected path executing send_email delete_file webhook_post immediately and green protected path through verifyAction gate with APPROVE VERIFY or BLOCK before execute. Bottom note: mixed paths equal control bypass under pressure. Right side five-item production tool calling checklist: one wrapper per tool, validate args before policy, actor org source trust correlation ID, signed HMAC tokens bound to audit ID, execution receipts proving side effects ran. Footer: verifyAction tool-use www.sanctumruntime.com.
```

---

## Strategy check (Tier 2 arc)

| Day | Theme | Article | Status |
|-----|-------|---------|--------|
| 1 | Agentic risk framework | `/blog/what-is-agentic-ai-risk-management` | ✅ Posted |
| 2 | MCP server security | `/blog/mcp-server-security-checklist-2026` | ✅ Posted |
| 3 | Data exfiltration chains | `/blog/how-to-prevent-ai-agent-data-exfiltration` | ✅ Posted |
| 4 | Guardrails vs runtime auth | `/blog/runtime-authorization-vs-guardrails-explained` | ✅ Posted |
| **5** | **Tool calling patterns** | **`/blog/best-practices-for-ai-agent-tool-calling`** | **← This post** |
| 6 | RBAC at execution time | `/blog/ai-agent-rbac-for-tool-permissions` | Next |
| 7 | Agentic commerce fraud | `/blog/agentic-commerce-fraud-prevention` | Planned |
| 8 | Action approval gates | `/blog/ai-agent-action-approval-before-execution` | Planned |
| 9 | Runtime trust layer | `/blog/runtime-trust-layer-for-ai-agents` | Planned |
| 10 | MCP action gate | `/blog/mcp-server-action-gate` | Planned |

**Why Day 5 now:** Tier 2 moved from governance (Day 1) → MCP surface (Day 2) → exfiltration chains (Day 3) → layer comparison (Day 4). Tool calling is the operational bridge — where teams actually wire verifyAction into LangChain, MCP, and custom agents. This post converts architecture awareness into implementation patterns.

---

## LinkedIn post (copy/paste)

```
Your agent has 23 tools.

Half of them bypass your security layer.

That is the #1 tool-calling anti-pattern in production: mixed execution paths. Some tools route through verifyAction. Others call APIs directly because "reads are safe" or "we'll gate writes later."

Under pressure — incident response, demo week, a hotfix branch — the unprotected path becomes the default.

Tool calling is where agents move from text to impact. Treat every side-effecting capability like a controlled API surface:

→ send_email, webhook_post, database writes
→ file delete, prod deploy, payment capture
→ robot commands, smart device actions

Production tool calling best practices (2026):

1. One wrapper per tool — never mix protected and unprotected execution paths
2. Validate arguments in server code before policy evaluation — schema, ranges, path allowlists
3. Include actor, org, source trust, and correlation ID in every verify call
4. Bind approval to short-lived HMAC tokens scoped to audit ID — no replay across actions
5. Log execution receipts — did the executor actually run, and with what outcome?

What it should not rely on:

→ Prompt instructions like "only use tools when necessary"
→ Gating writes while leaving delete_file and send_email on a fast path
→ UI RBAC with no enforcement at the tool executor
→ Post-hoc log review when the side effect already completed

Should read-only tools be gated?

Not always blocked — but log and score them. Reconnaissance patterns (read volume, sensitive paths) often precede exfiltration chains your moderation stack never sees.

A common week-one failure:

Team wraps payment tools with verifyAction. Email and filesystem MCP tools call APIs directly — "they're internal." Prompt injection in a support ticket triggers read_file on .env → send_email to external address. Security reviews chat logs. Conversation looked fine. Damage happened entirely in unprotected tool calls.

Standardize the wrapper. Gate the side effect.

Full guide — wrappers, signed tokens, validation order, and scaling patterns:
https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling

Save this before your next agent ships a new tool. How many of your tools share one verify path today?

#ToolUse #AIAgents #AISecurity #MCP #RuntimeSecurity
```

**~2,051 characters**

---

## Twitter / X — thread (recommended)

Article link (use in final tweet): `https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling`

**1/8**
```
Your agent has 23 tools.

Half of them bypass your security layer.

That is not a tooling problem. That is mixed execution paths.
```

**2/8**
```
Mixed paths under pressure:

→ Some tools route through verifyAction
→ Others call APIs directly ("reads are safe")
→ Hotfix week: unprotected path becomes default

One gap = full bypass.
```

**3/8**
```
Production tool calling path:

→ Agent selects tool
→ validate args in server code
→ verifyAction({ actor, action, context })
→ APPROVE / REQUIRE_VERIFICATION / BLOCKED
→ Executor runs only after gate + signed token
```

**4/8**
```
5-item checklist:

1. One wrapper per tool — same verify path always
2. Validate args before policy (schema + allowlists)
3. Actor, org, source trust, correlation ID every call
4. Signed HMAC tokens bound to audit ID
5. Execution receipts — prove the side effect ran
```

**5/8**
```
What it should NOT rely on:

→ "Be careful with tools" in the system prompt
→ Gating payments but leaving email MCP on a fast path
→ UI RBAC with no enforcement at the executor
→ Post-hoc logs after the side effect completed
```

**6/8**
```
Read-only tools?

Not always blocked — but log and score them.

Reconnaissance patterns often precede exfiltration chains moderation never sees.
```

**7/8**
```
Week-one failure:

Payments gated with verifyAction ✓
Email + filesystem MCP call APIs directly ✗

Ticket prompt injection → read .env → send_email external.

Chat looked fine. Tools weren't gated.
```

**8/8**
```
Full guide — wrappers, tokens, validation order:

https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling

#ToolUse #AIAgents #AISecurity
```

---

## Twitter / X — single post (280-char alternative)

```
23 tools. Half bypass your security layer.

Mixed paths = control bypass under pressure.

Production tool calling guide ↓
https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling

#ToolUse #AISecurity
```

---

## Hashtags

| Platform | Tags |
|----------|------|
| **LinkedIn** | `#ToolUse` `#AIAgents` `#AISecurity` `#MCP` `#RuntimeSecurity` |
| **Twitter** | `#ToolUse` `#AIAgents` `#AISecurity` |

**Article tags (on-site):** `tool-use`, `ai-agents`, `sdk`, `security`

---

## After posting

1. Request indexing in GSC for `https://www.sanctumruntime.com/blog/best-practices-for-ai-agent-tool-calling` (Tier 2 #5).
2. Reply to comments in the first 90 minutes.
3. Attach `linkedin-tool-calling-tier2-day5-1080x1350.png` on LinkedIn.
4. Founder repost within 2 hours.

---

## Tier 2 series map (next)

| Day | Article URL |
|-----|-------------|
| Day 6 | `/blog/ai-agent-rbac-for-tool-permissions` |
| Day 7 | `/blog/agentic-commerce-fraud-prevention` |
| Day 8 | `/blog/ai-agent-action-approval-before-execution` |
| Day 9 | `/blog/runtime-trust-layer-for-ai-agents` |
| Day 10 | `/blog/mcp-server-action-gate` |
