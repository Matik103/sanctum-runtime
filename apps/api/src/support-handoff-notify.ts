import { escapeHtml, wrapEmail } from './email-layout.js'
import { getSupabaseAuthConfig, createSupabaseAdmin } from './auth.js'
import { logger as rootLogger } from './logger.js'
import {
  DEFAULT_SUPPORT_INBOX_NOTIFY_EMAIL,
  resolveSupportNotifyEmail,
  type SupportInboxConfig,
} from './support-inbox-auth.js'

const log = rootLogger.child({ service: 'support-handoff-notify' })

export type HandoffNotifyInput = {
  sessionPublicId: string
  reason: string
  visitorMessage: string
  landingPath?: string | null
  transcript: { role: string; content: string; created_at: string }[]
  inbox: SupportInboxConfig
  consoleBaseUrl?: string
}

function transcriptText(rows: HandoffNotifyInput['transcript']): string {
  return rows
    .slice(-12)
    .map((m) => `[${m.created_at}] ${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n')
}

function transcriptHtml(rows: HandoffNotifyInput['transcript']): string {
  const lines = rows
    .slice(-12)
    .map(
      (m) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:11px;white-space:nowrap;">${escapeHtml(m.role)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #1e293b;color:#e2e8f0;font-size:12px;">${escapeHtml(m.content.slice(0, 800))}</td></tr>`,
    )
    .join('')
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${lines}</table>`
}

function resolveFromAddress(): string {
  return (
    process.env.SUPPORT_INBOX_FROM_EMAIL?.trim() ||
    process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
    'Sanctum Guide <support@sanctumruntime.com>'
  )
}

async function enqueueSupportHandoffEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  lastError?: string
}): Promise<void> {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return
  try {
    await createSupabaseAdmin(cfg).from('email_queue').insert({
      org_id: null,
      recipient: input.to,
      subject: input.subject,
      html: input.html,
      text_body: input.text,
      last_error: input.lastError?.slice(0, 500) ?? null,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    })
    log.info({ to: input.to }, 'support handoff email queued for retry')
  } catch (err) {
    log.warn({ err }, 'failed to enqueue support handoff email')
  }
}

function supportPortalUrl(sessionPublicId: string, consoleBaseUrl?: string): string {
  const base = (
    consoleBaseUrl ??
    process.env.SUPPORT_PORTAL_URL ??
    process.env.VITE_CONSOLE_URL ??
    process.env.CONSOLE_URL ??
    'https://console.sanctumruntime.com'
  ).replace(/\/$/, '')
  const params = new URLSearchParams({
    page: 'support-inbox',
    session: sessionPublicId,
  })
  return `${base}/?${params.toString()}`
}

export async function notifySupportHandoff(input: HandoffNotifyInput): Promise<void> {
  const to = resolveSupportNotifyEmail(input.inbox.notify_email)
  const inboxUrl = supportPortalUrl(input.sessionPublicId, input.consoleBaseUrl)

  const title = `Support handoff: ${input.reason}`
  const summary = input.visitorMessage.slice(0, 280)

  const html = wrapEmail({
    preheader: summary,
    title,
    sections: [
      `<p style="margin:0 0 12px;color:#cbd5e1;font-size:14px;line-height:1.5;">A visitor requested human help on the marketing support chat.</p>`,
      `<p style="margin:0 0 8px;color:#94a3b8;font-size:12px;"><strong style="color:#e2e8f0;">Session:</strong> ${escapeHtml(input.sessionPublicId)}</p>`,
      input.landingPath
        ? `<p style="margin:0 0 8px;color:#94a3b8;font-size:12px;"><strong style="color:#e2e8f0;">Landing:</strong> ${escapeHtml(input.landingPath)}</p>`
        : '',
      `<p style="margin:0 0 16px;color:#94a3b8;font-size:12px;"><strong style="color:#e2e8f0;">Latest message:</strong> ${escapeHtml(summary)}</p>`,
      `<p style="margin:0 0 8px;color:#e2e8f0;font-size:13px;font-weight:600;">Recent transcript</p>`,
      transcriptHtml(input.transcript),
      `<p style="margin:20px 0 0;"><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">Open support portal</a></p>`,
    ],
  })

  const text =
    `${title}\n\nSession: ${input.sessionPublicId}\nReason: ${input.reason}\n\n` +
    `Latest: ${summary}\n\nTranscript:\n${transcriptText(input.transcript)}\n\nInbox: ${inboxUrl}`

  await Promise.allSettled([
    sendResendEmail(to, title, html, text),
    input.inbox.slack_webhook_url
      ? sendSlack(input.inbox.slack_webhook_url, {
          session: input.sessionPublicId,
          reason: input.reason,
          message: summary,
          inboxUrl,
        })
      : Promise.resolve(),
  ])
}

async function sendResendEmail(to: string, subject: string, html: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    log.warn({ to }, 'RESEND_API_KEY unset — queuing support handoff email')
    await enqueueSupportHandoffEmail({ to, subject, html, text, lastError: 'RESEND_API_KEY not set' })
    return
  }

  const from = resolveFromAddress()
  const recipient = to || DEFAULT_SUPPORT_INBOX_NOTIFY_EMAIL

  let lastErr: string | undefined
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [recipient], subject, html, text }),
    })
    if (res.ok) {
      log.info({ to: recipient }, 'support handoff email sent via Resend')
      return
    }
    lastErr = `Resend HTTP ${res.status}: ${await res.text().catch(() => String(res.status))}`
  } catch (err) {
    lastErr = err instanceof Error ? err.message : String(err)
  }

  log.warn({ to: recipient, err: lastErr }, 'support handoff email failed — queuing retry')
  await enqueueSupportHandoffEmail({ to: recipient, subject, html, text, lastError: lastErr })
}

async function sendSlack(
  webhookUrl: string,
  payload: { session: string; reason: string; message: string; inboxUrl: string },
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Support handoff (${payload.reason}) — session ${payload.session}`,
        attachments: [
          {
            color: '#3b82f6',
            fields: [
              { title: 'Message', value: payload.message, short: false },
              { title: 'Inbox', value: payload.inboxUrl, short: false },
            ],
          },
        ],
      }),
    })
    if (!res.ok) log.warn({ status: res.status }, 'support handoff slack failed')
  } catch (err) {
    log.warn({ err }, 'support handoff slack error')
  }
}
