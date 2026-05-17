/**
 * Notification service — fire-and-forget alerts via Resend, Slack, or generic webhook.
 *
 * Configuration (env vars):
 *   RESEND_API_KEY               → send transactional email via Resend
 *   NOTIFICATION_FROM_EMAIL      → sender address (default: alerts@sanctum.run)
 *   NOTIFICATION_TO_EMAIL        → fallback recipient (org-level prefs override this)
 *   SLACK_WEBHOOK_URL            → Slack incoming webhook
 *   NOTIFICATION_WEBHOOK_URL     → generic webhook (PagerDuty, OpsGenie, custom)
 */

export type NotificationEventType =
  | 'quota.warning'
  | 'quota.exceeded'
  | 'anomaly.spike'
  | 'runtime.extended_offline'
  | 'billing.plan_changed'
  | 'security.attestation_failed'

export interface NotificationEvent {
  type: NotificationEventType
  orgId: string
  title: string
  body: string
  data?: Record<string, unknown>
  severity?: 'info' | 'warning' | 'critical'
}

interface OrgNotificationPrefs {
  email?: string | null
  slackWebhookUrl?: string | null
  notificationWebhookUrl?: string | null
}

async function sendResend(event: NotificationEvent, to: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const from = process.env.NOTIFICATION_FROM_EMAIL ?? 'Sanctum Alerts <alerts@sanctum.run>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[Sanctum] ${event.title}`,
      text: [
        event.body,
        '',
        `Event: ${event.type}`,
        `Org: ${event.orgId}`,
        `Severity: ${event.severity ?? 'info'}`,
        `Time: ${new Date().toISOString()}`,
        '',
        'Manage notification preferences in your Sanctum dashboard.',
      ].join('\n'),
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString())
    console.warn('[notifications] Resend delivery failed:', err)
  }
}

async function sendSlack(event: NotificationEvent, webhookUrl: string): Promise<void> {
  const colorMap: Record<string, string> = {
    info: '#4f7cff',
    warning: '#f59e0b',
    critical: '#ef4444',
  }
  const color = colorMap[event.severity ?? 'info'] ?? '#4f7cff'

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [{
        color,
        title: event.title,
        text: event.body,
        fields: [
          { title: 'Event', value: event.type, short: true },
          { title: 'Org', value: event.orgId, short: true },
          { title: 'Severity', value: event.severity ?? 'info', short: true },
          { title: 'Time', value: new Date().toISOString(), short: true },
        ],
        footer: 'Sanctum Runtime',
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString())
    console.warn('[notifications] Slack delivery failed:', err)
  }
}

async function sendWebhook(event: NotificationEvent, webhookUrl: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Sanctum-Event': event.type },
    body: JSON.stringify({
      event: event.type,
      severity: event.severity ?? 'info',
      title: event.title,
      body: event.body,
      org_id: event.orgId,
      data: event.data ?? {},
      timestamp: new Date().toISOString(),
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString())
    console.warn('[notifications] Webhook delivery failed:', err)
  }
}

export function sendNotification(event: NotificationEvent, prefs?: OrgNotificationPrefs): void {
  const email = prefs?.email ?? process.env.NOTIFICATION_TO_EMAIL
  const slackUrl = prefs?.slackWebhookUrl ?? process.env.SLACK_WEBHOOK_URL
  const webhookUrl = prefs?.notificationWebhookUrl ?? process.env.NOTIFICATION_WEBHOOK_URL

  const tasks: Promise<void>[] = []

  if (email) tasks.push(sendResend(event, email).catch((e) => console.warn('[notifications] email error:', e)))
  if (slackUrl) tasks.push(sendSlack(event, slackUrl).catch((e) => console.warn('[notifications] slack error:', e)))
  if (webhookUrl) tasks.push(sendWebhook(event, webhookUrl).catch((e) => console.warn('[notifications] webhook error:', e)))

  if (tasks.length === 0) {
    // No channels configured — log to console so operators aren't silent
    console.warn(`[notifications] ${event.severity?.toUpperCase() ?? 'INFO'} [${event.type}] org=${event.orgId}: ${event.title}`)
    return
  }

  // Fire-and-forget — never block request handling
  void Promise.allSettled(tasks)
}

/** Deduplication: prevent repeated alerts for the same org+event within the cooldown window */
const alertCooldowns = new Map<string, number>()

export function sendNotificationDeduped(
  event: NotificationEvent,
  prefs?: OrgNotificationPrefs,
  cooldownMs = 3_600_000, // 1 hour default
): void {
  const key = `${event.orgId}:${event.type}`
  const last = alertCooldowns.get(key) ?? 0
  if (Date.now() - last < cooldownMs) return
  alertCooldowns.set(key, Date.now())
  sendNotification(event, prefs)
}
