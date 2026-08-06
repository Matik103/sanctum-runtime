# Tier 1 Post #8 — Stop AI Agents Sending Emails Without Approval

**Article:** [Stop AI Agents Sending Emails Without Approval (2026)](https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval)  
**GSC priority:** Tier 1 #9 (page-1 candidate, 0% CTR fix)  
**Series position:** Day 8 (after kill switch / fleet pause — high-blast-radius action control)

**Images:**
- `public/marketing/linkedin-email-approval-day8-1200x627.png` (LinkedIn feed / Twitter)
- `public/marketing/linkedin-email-approval-day8-1080x1350.png` (LinkedIn portrait)

**Alt text — feed `linkedin-email-approval-day8-1200x627.png` (enter in LinkedIn before publish):**
- **Short:** Sanctum Runtime infographic: your prompt says ask before sending email, but the agent sent 847 messages. Flow shows send_email gated by verifyAction with REQUIRE_VERIFICATION for external and bulk sends.
- **Detailed:** Sanctum Runtime infographic on dark navy background contrasting prompt-only email rules with a production email gate. Agent send_email is tagged state-changing, routed through verifyAction, queued for operator review with recipient and source-trust context, and blocked or escalated on SLA timeout — never silent auto-send. Footer links to www.sanctumruntime.com email-approval guide.

**Alt text — portrait `linkedin-email-approval-day8-1080x1350.png` (enter in LinkedIn before publish):**
- **Short:** Vertical Sanctum Runtime email-approval infographic: gate send_email before the API fires, with role-based operators and SLA timeout that blocks instead of auto-sending.
- **Detailed:** Vertical Sanctum Runtime portrait graphic listing design rules for agent email control — default external recipients to REQUIRE_VERIFICATION, context-rich review screens, and SLA timeout that blocks or escalates — plus who approves: role-based operators, not the agent.

---

## LinkedIn post (copy/paste)

```
Your prompt says "always ask before sending email."

The agent sent 847 messages anyway.

That is not a policy failure. That is architecture without an execution gate.

Prompt instructions are suggestions the model can ignore — through drift, indirect injection, or a tool chain that never surfaced the send step to a human. Email, Slack, CRM writes, and bulk outreach are state-changing actions. They need the same verify-before-execute boundary as payments and prod deploys.

What a production email gate actually does:

→ Tags send_email (and messaging tools) as state-changing actions
→ Routes every send through verifyAction before the API fires
→ Returns REQUIRE_VERIFICATION for external recipients and bulk sends
→ Queues operator review with recipient scope, intent, and source-trust context
→ Blocks or escalates on SLA timeout — never silent auto-send

What it should not rely on:

→ System prompts like "never email without permission"
→ Post-hoc log review after customers complain
→ Per-agent custom code that breaks when you add a second workflow
→ Auto-approve after 24 hours because nobody checked the queue

3 design rules we use for agent email control:

1. Default external → REQUIRE_VERIFICATION — internal-only auto-approve only with explicit policy
2. Operator review shows recipient list, message intent, data sensitivity, and untrusted source flags
3. SLA timeout blocks or escalates — high-risk email must not run silently after long delays

Who should approve?

Role-based operators with context-rich review screens — not the agent, not a generic chat window. Mobile PWA + push for on-call when sends are time-sensitive.

A common week-one failure:

Support agent wired to Gmail MCP. Prompt says ask first. A poisoned ticket summary triggers send_email to 400 customers. Nobody saw a queue. The "approval" was a line in the system prompt the model skipped on step three of a five-tool chain.

Prompt rules are hopes. Policy gates are controls.

Full guide — runtime email gates, human verification queues, and SLA design for autonomous agents:
https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval

Save this before your next agent ships email or CRM automation. Does send_email go through verifyAction today?

#HumanInTheLoop #AISecurity #AIAgents #EmailAutomation #RuntimeSecurity
```

**~2,038 characters**

---

## Twitter / X — thread (recommended)

Article link (use in final tweet): `https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval`

**1/8**
```
Your prompt says "always ask before sending email."

The agent sent 847 messages anyway.

That is not a policy failure. That is no execution gate.
```

**2/8**
```
Prompt rules are suggestions the model can ignore:

→ drift
→ indirect injection
→ tool chains that never surface send_email to a human

Email is a state-changing action.
```

**3/8**
```
A production email gate:

→ send_email tagged state-changing
→ verifyAction before API fires
→ REQUIRE_VERIFICATION for external + bulk
→ Operator queue with recipient + intent context
```

**4/8**
```
What it should NOT rely on:

→ "never email without permission" in the system prompt
→ Post-hoc logs after customers complain
→ Auto-approve after 24h because nobody checked
```

**5/8**
```
3 design rules:

1. Default external → REQUIRE_VERIFICATION
2. Review shows recipients, intent, sensitivity, source-trust
3. SLA timeout blocks or escalates — never silent auto-send
```

**6/8**
```
Who approves?

Role-based operators with context-rich review — not the agent.

Mobile PWA + push when sends are time-sensitive.
```

**7/8**
```
Week-one failure:

Gmail MCP agent. Prompt says ask first.

Poisoned ticket → send_email to 400 customers.

No queue. "Approval" was a prompt line skipped on tool 3 of 5.
```

**8/8**
```
Full guide — runtime email gates & human verification for agents:

https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval

#HumanInTheLoop #AISecurity #AIAgents
```

---

## Twitter / X — single post (280-char alternative)

```
Prompt says "ask before email." Agent sent 847 anyway.

Route send_email through verifyAction → REQUIRE_VERIFICATION for external sends. SLA timeout blocks — never auto-send.

Guide ↓
https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval

#AISecurity #AIAgents
```

---

## Hashtags

| Platform | Tags |
|----------|------|
| **LinkedIn** | `#HumanInTheLoop` `#AISecurity` `#AIAgents` `#EmailAutomation` `#RuntimeSecurity` |
| **Twitter** | `#HumanInTheLoop` `#AISecurity` `#AIAgents` |

Article tags (on-site): `ai-agents`, `human-in-the-loop`, `email-automation`, `policy-engine`

---

## After posting

1. Request indexing in GSC for `https://www.sanctumruntime.com/blog/how-to-stop-ai-agents-from-sending-emails-without-approval` (Tier 1 #9).
2. Reply to comments in the first 90 minutes.
3. Attach `linkedin-email-approval-day8-1080x1350.png` on LinkedIn for max mobile presence.
4. Founder repost with 1–2 sentences of personal voice within 2 hours.

---

## Series map (remaining)

| Day | Article URL |
|-----|-------------|
| Day 9 | `/blog/mobile-pwa-runtime-verification` → see `LINKEDIN_TIER1_POST9_MOBILE_PWA.md` |
| Day 10 | `/what-is-sanctum-runtime` |
| Day 11 | `/` |
