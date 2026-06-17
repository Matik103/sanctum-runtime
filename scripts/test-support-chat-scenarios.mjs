#!/usr/bin/env node
/**
 * Comprehensive support chat scenario tests.
 * Usage: node scripts/test-support-chat-scenarios.mjs [API_BASE]
 */
const API = (process.argv[2] ?? 'http://127.0.0.1:3099').replace(/\/$/, '')

const SCENARIOS = [
  // Pricing & sales
  {
    category: 'pricing',
    message: 'what is the cheapest plan?',
    expectSlug: /page\/pricing/,
    expectContent: /\$0|Developer|observe|none|no govern/i,
    rejectContent: /50\/mo|50\/month|50 governed/i,
    rejectSlug: null,
  },
  {
    category: 'pricing',
    message: 'how much does Operator cost?',
    expectSlug: /page\/pricing/,
    expectContent: /\$59|Operator/i,
    rejectHandoff: true,
  },
  {
    category: 'pricing',
    message: 'I want enterprise pricing',
    expectSlug: /page\/pricing/,
    expectContent: /Enterprise|contact sales|custom/i,
    rejectContent: /cheapest plan is \*\*Observer\*\*/i,
  },
  {
    category: 'pricing',
    message: 'what is included in the Personal plan?',
    expectSlug: /page\/pricing/,
    expectContent: /Personal|\$12/i,
  },
  {
    category: 'pricing',
    message: 'is there a free trial?',
    expectSlug: /page\/pricing/,
    expectContent: /Developer|\$0|free/i,
  },

  {
    category: 'pricing',
    message: 'how much is the Team plan?',
    expectSlug: /page\/pricing/,
    expectContent: /\$299|Team/i,
  },
  {
    category: 'pricing',
    message: 'compare Developer vs Operator',
    expectSlug: /page\/pricing/,
    expectContent: /Developer|Operator/i,
  },

  // Product & positioning
  {
    category: 'product',
    message: 'what is Sanctum Runtime?',
    expectSlug: /product\/overview|docs\/index/,
    expectContent: /runtime trust|verify|agent/i,
    rejectSlug: /page\/pricing/,
  },
  {
    category: 'product',
    message: 'how is Sanctum different from guardrails?',
    expectSlug: /runtime-authorization-vs-guardrails|sanctum-vs-guardrails/,
    expectContent: /guardrail|runtime|execution/i,
  },
  {
    category: 'product',
    message: 'what is runtime trust?',
    expectSlug: /blog\/runtime-trust|product\/overview/,
    expectContent: /runtime trust|execution/i,
  },

  // Technical / docs
  {
    category: 'technical',
    message: 'how do I install the SDK?',
    expectSlug: /docs\/index/,
    expectContent: /SDK|npm|install|quick/i,
  },
  {
    category: 'technical',
    message: 'what is verifyAction?',
    expectSlug: /docs\/index/,
    expectContent: /verify|action|policy/i,
  },
  {
    category: 'technical',
    message: 'how do action tokens work?',
    expectSlug: /signed-action-tokens|product\/overview/,
    expectContent: /action token|HMAC|signed|verify/i,
    rejectSlug: /page\/pricing/,
  },
  {
    category: 'technical',
    message: 'what is MCP and how does Sanctum use it?',
    expectSlug: /mcp-server-action-gate|mcp-server-security/,
    expectContent: /MCP|Model Context Protocol|tool/i,
    rejectSlug: /page\/pricing/,
    rejectHandoff: true,
  },
  {
    category: 'technical',
    message: 'how does human-in-the-loop approval work?',
    expectSlug: /human-in-the-loop|approval/,
    expectContent: /approval|human|verify/i,
  },

  // Security & governance
  {
    category: 'security',
    message: 'can AI agents buy things online safely?',
    expectSlug: /can-ai-agents-buy-online/,
    expectContent: /buy|purchase|safe|approval/i,
  },
  {
    category: 'security',
    message: 'how do I prevent prompt injection in agents?',
    expectSlug: /prompt-injection|indirect-prompt/,
    expectContent: /prompt injection|untrusted|source/i,
  },
  {
    category: 'security',
    message: 'what is SOC2 compliance for AI agents?',
    expectSlug: /soc2|can-ai-agents-be-soc2/,
    expectContent: /SOC2|compliance|audit/i,
  },
  {
    category: 'security',
    message: 'how do I set up a kill switch for agents?',
    expectSlug: /kill-switch|stop-button/,
    expectContent: /kill|stop|override/i,
  },

  {
    category: 'security',
    message: 'how do I run agent security offline?',
    expectSlug: /offline|can-you-run/,
    expectContent: /offline|local|connectivity/i,
  },
  {
    category: 'security',
    message: 'what is confused deputy in AI agents?',
    expectSlug: /confused-deputy/,
    expectContent: /confused deputy|delegat|authority/i,
  },

  // Multi-provider / integrations
  {
    category: 'integrations',
    message: 'can OpenAI Claude and Gemini share one control plane?',
    expectSlug: /can-openai-claude-gemini/,
    expectContent: /OpenAI|Claude|Gemini|control plane/i,
  },
  {
    category: 'integrations',
    message: 'does Sanctum work with LangChain?',
    expectSlug: /langchain|docs\/index|product\/overview/,
    expectContent: /LangChain|middleware|agent/i,
  },
  {
    category: 'integrations',
    message: 'can I use Sanctum with ROS2 robots?',
    expectSlug: /ros2|embodied|robotics/,
    expectContent: /ROS2|robot|embodied/i,
  },

  // Operations
  {
    category: 'operations',
    message: 'how do I get started quickly?',
    expectSlug: /docs\/index|product\/overview|introducing/,
    expectContent: /quick|start|console|SDK/i,
  },
  {
    category: 'operations',
    message: 'where is the console?',
    expectSlug: /product\/overview|docs\/index/,
    expectContent: /console\.sanctumruntime/i,
  },
  {
    category: 'operations',
    message: 'what is observability vs control for agents?',
    expectSlug: /observability-vs-control/,
    expectContent: /observability|control|runtime/i,
  },

  {
    category: 'operations',
    message: 'how do I design policies that scale?',
    expectSlug: /policies-that-scale|policy-engine/,
    expectContent: /polic(y|ies)|scale|risk/i,
  },
  {
    category: 'operations',
    message: 'what is open core vs enterprise?',
    expectSlug: /open-core|product\/overview/,
    expectContent: /open.?core|enterprise|SDK/i,
  },

  // Edge / negative
  {
    category: 'edge',
    message: 'asdfghjkl random nonsense query',
    expectSlug: null,
    expectContent: /docs|contact|knowledge base|Sanctum/i,
    allowEmptyCitations: true,
  },
  {
    category: 'edge',
    message: 'hi',
    expectSlug: null,
    expectContent: /Sanctum|runtime trust|dig into|help/i,
    allowEmptyCitations: true,
    rejectHandoff: true,
  },
  {
    category: 'edge',
    message: 'talk to sales',
    expectHandoff: true,
    allowEmptyCitations: true,
  },
]

async function createSession() {
  const res = await fetch(`${API}/v1/support/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!res.ok) throw new Error(`session ${res.status}`)
  const data = await res.json()
  return data.session_id
}

async function chat(sessionId, message) {
  const res = await fetch(`${API}/v1/support/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`chat ${res.status}: ${text}`)
  }
  return res.json()
}

function evaluate(scenario, result) {
  const msg = result.message
  const slugs = (msg.citation_sources ?? []).map((c) => c.slug)
  const content = msg.content ?? ''
  const handoff = result.handoff ?? msg.handoff
  const issues = []

  if (scenario.expectSlug && !slugs.some((s) => scenario.expectSlug.test(s))) {
    issues.push(`missing expected slug ${scenario.expectSlug} (got: ${slugs.slice(0, 4).join(', ')})`)
  }
  if (scenario.rejectSlug && slugs.some((s) => scenario.rejectSlug.test(s))) {
    issues.push(`unwanted slug ${scenario.rejectSlug} in citations`)
  }
  if (scenario.expectContent && !scenario.expectContent.test(content)) {
    issues.push(`content missing pattern ${scenario.expectContent}`)
  }
  if (scenario.rejectContent && scenario.rejectContent.test(content)) {
    issues.push(`content matched rejected pattern`)
  }
  if (scenario.rejectHandoff && handoff?.recommended) {
    issues.push(`unexpected human handoff (reason: ${handoff.reason})`)
  }
  if (scenario.expectHandoff && !handoff?.recommended) {
    issues.push('expected handoff but none returned')
  }
  if (!scenario.allowEmptyCitations && slugs.length === 0) {
    issues.push('no citations returned')
  }
  if (!content.trim()) {
    issues.push('empty reply')
  }

  return { pass: issues.length === 0, issues, slugs: slugs.slice(0, 3), preview: content.slice(0, 120) }
}

async function main() {
  console.log(`Testing ${SCENARIOS.length} scenarios against ${API}\n`)

  let passed = 0
  let failed = 0
  const failures = []

  for (const scenario of SCENARIOS) {
    try {
      const sessionId = await createSession()
      const result = await chat(sessionId, scenario.message)
      const eval_ = evaluate(scenario, result)
      if (eval_.pass) {
        passed++
        console.log(`✓ [${scenario.category}] ${scenario.message}`)
      } else {
        failed++
        console.log(`✗ [${scenario.category}] ${scenario.message}`)
        for (const i of eval_.issues) console.log(`    → ${i}`)
        console.log(`    citations: ${eval_.slugs.join(', ')}`)
        failures.push({ scenario, ...eval_ })
      }
    } catch (err) {
      failed++
      console.log(`✗ [${scenario.category}] ${scenario.message}`)
      console.log(`    → ERROR: ${err.message}`)
      failures.push({ scenario, issues: [err.message] })
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed, ${SCENARIOS.length} total`)

  if (failures.length) {
    console.log('\nFailed scenarios summary:')
    for (const f of failures) {
      console.log(`  - [${f.scenario.category}] ${f.scenario.message}`)
      for (const i of f.issues ?? []) console.log(`      ${i}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
