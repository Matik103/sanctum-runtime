import type { SupportHandoff } from './support-agent-store.js'

const PRICING_FOLLOWUPS = [
  'Compare Observer vs Operator',
  'What does observe-only mean?',
  'Enterprise pricing',
] as const

const MCP_FOLLOWUPS = [
  'How does verify-before-execute work?',
  'MCP tool argument validation',
  'Human approval for risky actions',
] as const

const START_FOLLOWUPS = [
  'Quick start with the SDK',
  'Connect proxy setup',
  'Pricing and plans',
] as const

export function suggestFollowUps(
  userMessage: string,
  reply: string,
  handoff: SupportHandoff | null,
): string[] {
  const msg = userMessage.toLowerCase()
  const text = reply.toLowerCase()
  const out: string[] = []

  if (handoff?.recommended) {
    out.push('Request a human in this chat')
  }

  if (/\b(pric|plan|observer|operator|team|enterprise|\$)/i.test(msg) || /\bpricing\b/.test(text)) {
    out.push(...PRICING_FOLLOWUPS)
  } else if (/\b(mcp|tool|verify|gate|proxy)\b/i.test(msg) || /\bmcp\b/.test(text)) {
    out.push(...MCP_FOLLOWUPS)
  } else if (/\b(start|install|sdk|begin|getting started)\b/i.test(msg)) {
    out.push(...START_FOLLOWUPS)
  } else {
    out.push('What is Sanctum Runtime?', 'Pricing and plans', 'MCP security basics')
  }

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const s of out) {
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(s)
    if (deduped.length >= 3) break
  }
  return deduped
}
