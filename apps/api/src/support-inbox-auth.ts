import type { FastifyReply } from 'fastify'
import type { SupportAgentStore } from './support-agent-store.js'

export type SupportInboxConfig = {
  allowed_emails: string[]
  notify_email: string
  slack_webhook_url: string | null
}

function parseAllowedEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export function envAllowedInboxEmails(): string[] {
  const raw = process.env.SUPPORT_INBOX_ALLOWED_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function loadInboxConfig(store: SupportAgentStore): Promise<SupportInboxConfig> {
  const cfg = await store.loadInboxConfig()
  const envEmails = envAllowedInboxEmails()
  const dbEmails = parseAllowedEmails(cfg.allowed_emails)
  return {
    allowed_emails: [...new Set([...dbEmails, ...envEmails])],
    notify_email: cfg.notify_email?.trim() || 'support@sanctumruntime.com',
    slack_webhook_url: cfg.slack_webhook_url?.trim() || null,
  }
}

export async function assertSupportInboxOperator(
  store: SupportAgentStore,
  user: { id: string; email?: string },
  reply: FastifyReply,
): Promise<boolean> {
  const inbox = await loadInboxConfig(store)
  const email = user.email?.trim().toLowerCase()
  if (!email || !inbox.allowed_emails.includes(email)) {
    reply.status(403).send({ error: 'support_inbox_forbidden' })
    return false
  }
  return true
}
