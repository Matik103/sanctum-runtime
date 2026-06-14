import { escapeHtml, wrapEmail } from './email-layout.js'
import { logger as rootLogger } from './logger.js'
import type { SupportInboxConfig } from './support-inbox-auth.js'

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

export async function notifySupportHandoff(input: HandoffNotifyInput): Promise<void> {
  const inboxUrl =
    (input.consoleBaseUrl ?? 'https://console.sanctumruntime.com').replace(/\/$/, '') +
    '/?page=support-inbox'

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
      `<p style="margin:20px 0 0;"><a href="${escapeHtml(inboxUrl)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;">Open Support Inbox</a></p>`,
    ],
  })

  const text =
    `${title}\n\nSession: ${input.sessionPublicId}\nReason: ${input.reason}\n\n` +
    `Latest: ${summary}\n\nTranscript:\n${transcriptText(input.transcript)}\n\nInbox: ${inboxUrl}`

  await Promise.allSettled([
    sendResendEmail(input.inbox.notify_email, title, html, text),
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
    log.warn('RESEND_API_KEY unset — skipping support handoff email')
    return
  }
  const from =
    process.env.NOTIFICATION_FROM_EMAIL?.trim() ||
    'Sanctum Guide <support@sanctumruntime.com>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!res.ok) {
    log.warn({ status: res.status }, 'support handoff email failed')
  }
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
