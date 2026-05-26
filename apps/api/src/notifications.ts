/**
 * Notification service — fire-and-forget alerts via Resend, Slack, or generic webhook.
 *
 * Configuration (env vars):
 *   RESEND_API_KEY               → send transactional email via Resend
 *   NOTIFICATION_FROM_EMAIL      → sender (default: Sanctum Runtime Alerts <alerts@sanctumruntime.com>)
 *   NOTIFICATION_TO_EMAIL        → fallback recipient when org has no email configured
 *   SLACK_WEBHOOK_URL            → Slack incoming webhook (global fallback)
 *   NOTIFICATION_WEBHOOK_URL     → generic webhook fallback (PagerDuty, OpsGenie, custom)
 */

import {
  button,
  detailsTable,
  escapeHtml,
  plainText,
  severityBadge,
  spacer,
  wrapEmail,
} from './email-layout.js'
import { logger as rootLogger } from './logger.js'

const log = rootLogger.child({ service: 'notifications' })

export type NotificationEventType =
  // Anomaly / policy
  | 'anomaly.spike'
  | 'agent.policy_violation'
  | 'agent.loop_detected'
  | 'agent.blocked_action'
  | 'shield.containment'
  // Runtime / infrastructure
  | 'runtime.offline'
  | 'runtime.extended_offline'
  | 'runtime.tampered'
  | 'runtime.attestation_failed'
  | 'runtime.high_memory'
  | 'runtime.reconnected'
  // Security
  | 'security.attestation_failed'
  | 'security.unauthorized_access'
  | 'security.api_abuse'
  // Billing / quota
  | 'quota.warning'
  | 'quota.exceeded'
  | 'billing.plan_changed'
  | 'billing.payment_failed'

export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'emergency'

export interface NotificationEvent {
  type: NotificationEventType
  orgId: string
  title: string
  body: string
  data?: Record<string, unknown>
  severity?: NotificationSeverity
}

interface OrgNotificationPrefs {
  email?: string | null
  slackWebhookUrl?: string | null
  notificationWebhookUrl?: string | null
  orgId?: string | null
}

// ── Email (Resend) ────────────────────────────────────────────────────────────

function severityColor(severity: NotificationSeverity): string {
  switch (severity) {
    case 'emergency': return '#dc2626'
    case 'critical':  return '#ef4444'
    case 'warning':   return '#f59e0b'
    default:          return '#3b82f6'
  }
}

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function buildNotificationEmailHtml(event: NotificationEvent): string {
  const sev = event.severity ?? 'info'
  const color = severityColor(sev)
  const ts = new Date().toUTCString()
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://console.sanctumruntime.com'

  const dataRows: Array<[string, string]> = event.data
    ? Object.entries(event.data)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)])
    : []

  const sections: string[] = [
    `<p style="margin:0 0 8px;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;font-family:${FONT_STACK};">${escapeHtml(event.type)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#f4f4f5;line-height:1.3;font-family:${FONT_STACK};">${escapeHtml(event.title)}</h1>`,
    `<p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;font-family:${FONT_STACK};">${escapeHtml(event.body)}</p>`,
  ]

  if (dataRows.length > 0) {
    sections.push(
      `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#0f0f11;border:1px solid #27272a;border-radius:8px;"><tr><td style="padding:16px 20px;">${detailsTable(dataRows)}</td></tr></table>`,
      spacer(24),
    )
  }

  // Metadata strip — uses detailsTable for consistent spacing across clients
  sections.push(
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#0f0f11;border:1px solid #27272a;border-radius:8px;"><tr><td style="padding:14px 20px;">${detailsTable([['Org', event.orgId], ['Time', ts]])}</td></tr></table>`,
    spacer(28),
    button({ text: 'Open dashboard', href: dashboardUrl, variant: 'primary' }),
  )

  return wrapEmail({
    title: event.title,
    preheader: event.body.slice(0, 140),
    accentColor: color,
    headerAccent: severityBadge(sev, color),
    sections,
    footer:
      `<strong style="color:#a1a1aa;">${escapeHtml(event.orgId)}</strong> · ` +
      `Manage alerts in <a href="${escapeHtml(dashboardUrl)}/settings" style="color:#3b82f6;text-decoration:none;">notification settings</a>`,
  })
}

async function sendResend(event: NotificationEvent, to: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not set')

  const from =
    process.env.NOTIFICATION_FROM_EMAIL ??
    'Sanctum Runtime Alerts <alerts@sanctumruntime.com>'

  const sev = event.severity ?? 'info'
  const prefix =
    sev === 'emergency' ? '[EMERGENCY]'
    : sev === 'critical' ? '[CRITICAL]'
    : sev === 'warning'  ? '[WARNING]'
    : '[INFO]'

  const subject = `${prefix} ${event.title}`
  const html = buildNotificationEmailHtml(event)
  const text = [
    event.title,
    '',
    event.body,
    '',
    `Event:    ${event.type}`,
    `Org:      ${event.orgId}`,
    `Severity: ${sev}`,
    `Time:     ${new Date().toISOString()}`,
    '',
    'Manage notification preferences in your Sanctum dashboard.',
  ].join('\n')

  let lastErr: string | undefined
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    })
    if (res.ok) return
    lastErr = `Resend HTTP ${res.status}: ${await res.text().catch(() => String(res.status))}`
  } catch (e) {
    lastErr = e instanceof Error ? e.message : String(e)
  }

  // Transient failure — enqueue for background retry before propagating
  try {
    const { getSupabaseAuthConfig, createSupabaseAdmin } = await import('./auth.js')
    const cfg = getSupabaseAuthConfig()
    if (cfg) {
      await createSupabaseAdmin(cfg).from('email_queue').insert({
        org_id: event.orgId,
        recipient: to,
        subject,
        html,
        text_body: text,
        last_error: lastErr?.slice(0, 500),
        next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(), // retry in 5min
      })
    }
  } catch {
    /* best-effort — don't mask the original error */
  }

  throw new Error(lastErr ?? 'Resend failed')
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function sendSlack(event: NotificationEvent, webhookUrl: string): Promise<void> {
  const colorMap: Record<NotificationSeverity, string> = {
    info: '#3b82f6',
    warning: '#f59e0b',
    critical: '#ef4444',
    emergency: '#dc2626',
  }
  const color = colorMap[event.severity ?? 'info']

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [
        {
          color,
          title: event.title,
          text: event.body,
          fields: [
            { title: 'Event',    value: event.type,                  short: true },
            { title: 'Severity', value: event.severity ?? 'info',    short: true },
            { title: 'Org',      value: event.orgId,                 short: true },
            { title: 'Time',     value: new Date().toISOString(),    short: true },
          ],
          footer: 'Sanctum Runtime',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => String(res.status))
    throw new Error(`Slack HTTP ${res.status}: ${err}`)
  }
}

// ── Generic webhook ───────────────────────────────────────────────────────────

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
    const err = await res.text().catch(() => String(res.status))
    throw new Error(`Webhook HTTP ${res.status}: ${err}`)
  }
}

// ── Ops alert ─────────────────────────────────────────────────────────────────
// Fired when every configured channel fails. Emits a structured log line that
// any log drain (Render, Datadog, Papertrail) can alert on, and optionally POSTs
// to OPS_ALERT_WEBHOOK_URL (PagerDuty, OpsGenie, a separate Slack workspace, etc.)

type ChannelFailure = { channel: string; error: string }

async function sendOpsAlert(event: NotificationEvent, failures: ChannelFailure[]): Promise<void> {
  const payload = {
    alert: 'SANCTUM_NOTIFICATION_FAILURE',
    severity: event.severity ?? 'info',
    eventType: event.type,
    orgId: event.orgId,
    title: event.title,
    failedChannels: failures,
    timestamp: new Date().toISOString(),
  }

  log.error({ opsAlert: true, ...payload }, 'all notification channels failed')

  const opsWebhook = process.env.OPS_ALERT_WEBHOOK_URL
  if (!opsWebhook) return

  try {
    const res = await fetch(opsWebhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sanctum-Alert': 'notification_failure',
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      log.error({ opsAlert: true, status: res.status }, 'ops webhook returned error status')
    }
  } catch (e) {
    log.error({ opsAlert: true, err: e instanceof Error ? e : new Error(String(e)) }, 'ops webhook unreachable')
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function sendNotification(event: NotificationEvent, prefs?: OrgNotificationPrefs): void {
  void _sendWithFailover(event, prefs)
}

async function _sendWithFailover(
  event: NotificationEvent,
  prefs?: OrgNotificationPrefs,
): Promise<void> {
  const email      = prefs?.email                  ?? process.env.NOTIFICATION_TO_EMAIL
  const slackUrl   = prefs?.slackWebhookUrl        ?? process.env.SLACK_WEBHOOK_URL
  const webhookUrl = prefs?.notificationWebhookUrl ?? process.env.NOTIFICATION_WEBHOOK_URL

  // PWA web push is independent of the email/webhook failover channels. Start
  // it before any early return so a successful email does not suppress mobile
  // alerts and a push-only organization still receives incidents.
  void import('./push-routes.js').then(async ({ sendWebPushToOrg }) => {
    await sendWebPushToOrg(event.orgId, {
      title: event.title,
      body: event.body,
      tag: `${event.type}:${event.orgId}`,
      requireInteraction: event.severity === 'critical' || event.severity === 'emergency',
      url: '/?page=alerts',
      data: { ...(event.data ?? {}), type: event.type, orgId: event.orgId },
    })
  }).catch((e) => log.warn({ err: e instanceof Error ? e : new Error(String(e)) }, 'web push notification error'))

  // Primary channels participate in the failover logic
  type Channel = { name: string; fn: () => Promise<void> }
  const primary: Channel[] = []
  if (email)      primary.push({ name: 'email',   fn: () => sendResend(event, email) })
  if (slackUrl)   primary.push({ name: 'slack',   fn: () => sendSlack(event, slackUrl) })
  if (webhookUrl) primary.push({ name: 'webhook', fn: () => sendWebhook(event, webhookUrl) })

  if (primary.length === 0) {
    // Web push has already been dispatched; record that no external channel
    // is configured without treating a push-only workspace as an error.
    log.info({
      eventType:  event.type,
      severity:   event.severity ?? 'info',
      orgId:      event.orgId,
      title:      event.title,
    }, 'no email, Slack, or webhook notification channels configured')
    return
  }

  const sev = event.severity ?? 'info'
  const useParallel = sev === 'critical' || sev === 'emergency'
  const failures: ChannelFailure[] = []

  if (useParallel) {
    // Critical / emergency: fire every channel simultaneously for maximum coverage
    const settled = await Promise.allSettled(primary.map((c) => c.fn()))
    let anyOk = false
    for (let i = 0; i < primary.length; i++) {
      if (settled[i].status === 'fulfilled') {
        anyOk = true
      } else {
        const reason = (settled[i] as PromiseRejectedResult).reason
        failures.push({ channel: primary[i].name, error: String(reason) })
        log.warn({ channel: primary[i].name, eventType: event.type, reason: String(reason) }, 'notification channel failed')
      }
    }
    if (!anyOk) await sendOpsAlert(event, failures)
  } else {
    // Info / warning: sequential failover — try each channel in order, stop at first success
    for (const channel of primary) {
      try {
        await channel.fn()
        return // delivered — done
      } catch (e) {
        failures.push({ channel: channel.name, error: String(e) })
        log.warn({ channel: channel.name, err: e instanceof Error ? e : new Error(String(e)) }, 'channel failed, trying next')
      }
    }
    // Every configured channel failed
    await sendOpsAlert(event, failures)
  }

}

// ── Deduplication ─────────────────────────────────────────────────────────────
// In-memory cache is the fast path; Supabase is the source of truth across restarts.

const alertCooldowns = new Map<string, number>()
let dedupInitialised = false

async function loadDedupState(): Promise<void> {
  if (dedupInitialised) return
  dedupInitialised = true
  try {
    const { getSupabaseAuthConfig, createSupabaseAdmin } = await import('./auth.js')
    const cfg = getSupabaseAuthConfig()
    if (!cfg) return
    const db = createSupabaseAdmin(cfg)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await db
      .from('notification_dedup_log')
      .select('org_id, event_type, last_sent_at')
      .gte('last_sent_at', since)
    for (const row of data ?? []) {
      const key = `${row.org_id}:${row.event_type}`
      alertCooldowns.set(key, new Date(row.last_sent_at).getTime())
    }
    log.info({ count: data?.length ?? 0 }, 'notification dedup state loaded')
  } catch (e) {
    log.warn({ err: e instanceof Error ? e : new Error(String(e)) }, 'dedup state load failed')
  }
}

async function persistDedupEntry(orgId: string, eventType: string): Promise<void> {
  try {
    const { getSupabaseAuthConfig, createSupabaseAdmin } = await import('./auth.js')
    const cfg = getSupabaseAuthConfig()
    if (!cfg) return
    const db = createSupabaseAdmin(cfg)
    await db.from('notification_dedup_log').upsert(
      { org_id: orgId, event_type: eventType, last_sent_at: new Date().toISOString() },
      { onConflict: 'org_id,event_type' },
    )
  } catch (e) {
    log.warn({ err: e instanceof Error ? e : new Error(String(e)) }, 'dedup persist failed')
  }
}

/** Deduplication: suppress repeated alerts for the same org+event within the cooldown window.
 *  State survives API restarts via Supabase — no alert spam after redeploys. */
export function sendNotificationDeduped(
  event: NotificationEvent,
  prefs?: OrgNotificationPrefs,
  cooldownMs = 3_600_000,
): void {
  const key = `${event.orgId}:${event.type}`

  // Warm cache from DB on first call (non-blocking — if DB unavailable, in-memory still works)
  void loadDedupState()

  const last = alertCooldowns.get(key) ?? 0
  if (Date.now() - last < cooldownMs) return

  alertCooldowns.set(key, Date.now())
  void persistDedupEntry(event.orgId, event.type)
  sendNotification(event, prefs)
}

/** Pre-warm the dedup cache at startup so the first call is always accurate. */
export function initDedupCache(): void {
  void loadDedupState()
}
