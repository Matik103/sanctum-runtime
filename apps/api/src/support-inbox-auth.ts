import type { FastifyReply } from 'fastify'
import type { SupportAgentStore } from './support-agent-store.js'

export type SupportInboxOperator = {
  email: string
  display_name: string
  title?: string
}

export type SupportInboxConfig = {
  allowed_emails: string[]
  notify_email: string
  slack_webhook_url: string | null
  operators: SupportInboxOperator[]
}

function parseAllowedEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is string => typeof e === 'string')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export const DEFAULT_SUPPORT_INBOX_NOTIFY_EMAIL = 'support@sanctumruntime.com'

export function envAllowedInboxEmails(): string[] {
  const raw = process.env.SUPPORT_INBOX_ALLOWED_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Resend recipient for human handoff alerts — always support@ unless overridden. */
export function resolveSupportNotifyEmail(dbNotifyEmail?: string | null): string {
  const fromEnv =
    process.env.SUPPORT_INBOX_NOTIFY_EMAIL?.trim() ||
    process.env.NOTIFICATION_TO_EMAIL?.trim()
  if (fromEnv) return fromEnv
  const fromDb = dbNotifyEmail?.trim()
  if (fromDb) return fromDb
  return DEFAULT_SUPPORT_INBOX_NOTIFY_EMAIL
}

function parseOperators(raw: unknown): SupportInboxOperator[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const row = entry as Record<string, unknown>
      const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : ''
      const display_name = typeof row.display_name === 'string' ? row.display_name.trim() : ''
      if (!email || !display_name) return null
      const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : undefined
      return { email, display_name, title }
    })
    .filter((row): row is SupportInboxOperator => row !== null)
}

export function resolveOperatorDisplayName(
  inbox: SupportInboxConfig,
  email: string | undefined,
): string {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return 'Sanctum Support'
  const match = inbox.operators.find((op) => op.email === normalized)
  return match?.display_name ?? 'Sanctum Support'
}

export async function loadInboxConfig(store: SupportAgentStore): Promise<SupportInboxConfig> {
  const cfg = await store.loadInboxConfig()
  const envEmails = envAllowedInboxEmails()
  const dbEmails = parseAllowedEmails(cfg.allowed_emails)
  return {
    allowed_emails: [...new Set([...dbEmails, ...envEmails])],
    notify_email: resolveSupportNotifyEmail(cfg.notify_email),
    slack_webhook_url: cfg.slack_webhook_url?.trim() || null,
    operators: parseOperators(cfg.operators),
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
