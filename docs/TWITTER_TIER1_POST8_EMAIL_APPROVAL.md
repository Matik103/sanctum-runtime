# Tier 1 Day 8 — Twitter / X

**Article:** https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval  
**Image:** `linkedin-email-approval-day8-1200x627.png` (attach to tweet 1/8)

**Alt text (enter when attaching the image):**
```
Sanctum Runtime infographic: your prompt says ask before sending email, but the agent sent 847 messages. Flow shows send_email gated by verifyAction with REQUIRE_VERIFICATION for external and bulk sends, and SLA timeout that blocks instead of auto-sending.
```

**Hashtags (final tweet only):** `#HumanInTheLoop` `#AISecurity` `#AIAgents`

---

## Thread (recommended) — paste each block as a reply

### 1/8
```
Your prompt says "always ask before sending email."

The agent sent 847 messages anyway.

That is not a policy failure. That is no execution gate.
```

### 2/8
```
Prompt rules are suggestions the model can ignore:

→ drift
→ indirect injection
→ tool chains that never surface send_email to a human

Email is a state-changing action.
```

### 3/8
```
A production email gate:

→ send_email tagged state-changing
→ verifyAction before API fires
→ REQUIRE_VERIFICATION for external + bulk
→ Operator queue with recipient + intent context
```

### 4/8
```
What it should NOT rely on:

→ "never email without permission" in the system prompt
→ Post-hoc logs after customers complain
→ Auto-approve after 24h because nobody checked
```

### 5/8
```
3 design rules:

1. Default external → REQUIRE_VERIFICATION
2. Review shows recipients, intent, sensitivity, source-trust
3. SLA timeout blocks or escalates — never silent auto-send
```

### 6/8
```
Who approves?

Role-based operators with context-rich review — not the agent.

Mobile PWA + push when sends are time-sensitive.
```

### 7/8
```
Week-one failure:

Gmail MCP agent. Prompt says ask first.

Poisoned ticket → send_email to 400 customers.

No queue. "Approval" was a prompt line skipped on tool 3 of 5.
```

### 8/8
```
Full guide — runtime email gates & human verification for agents:

https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval

#HumanInTheLoop #AISecurity #AIAgents
```

---

## Single post (alternative)

```
Prompt says "ask before email." Agent sent 847 anyway.

Route send_email through verifyAction → REQUIRE_VERIFICATION for external sends. SLA timeout blocks — never auto-send.

Guide ↓
https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval

#AISecurity #AIAgents
```

---

## Posting checklist

- [ ] Attach `linkedin-email-approval-day8-1200x627.png` to tweet **1/8**
- [ ] Add the alt text from the top of this doc when uploading the image
- [ ] Post tweets 2–8 as replies in the same thread (no image on replies)
- [ ] Article link only in **8/8**
- [ ] Hashtags only in **8/8** (or single post)
