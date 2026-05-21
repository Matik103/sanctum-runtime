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

export type NotificationEventType =
  // Anomaly / policy
  | 'anomaly.spike'
  | 'agent.policy_violation'
  | 'agent.loop_detected'
  | 'agent.blocked_action'
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

function buildHtml(event: NotificationEvent): string {
  const sev = event.severity ?? 'info'
  const color = severityColor(sev)
  const ts = new Date().toUTCString()
  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://app.sanctumruntime.com'

  const dataRows = event.data
    ? Object.entries(event.data)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${k}</td>` +
            `<td style="padding:4px 0;color:#d1d5db;font-size:13px;font-family:ui-monospace,monospace;">${String(v)}</td></tr>`,
        )
        .join('')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #27272a;border-radius:8px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:#0f0f11;padding:20px 32px;border-bottom:1px solid #27272a;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-size:15px;font-weight:600;color:#f4f4f5;letter-spacing:-0.02em;">Sanctum Runtime</span>
                  <span style="font-size:13px;color:#71717a;margin-left:8px;">alerts@sanctumruntime.com</span>
                </td>
                <td align="right">
                  <span style="display:inline-block;background:${color}22;color:${color};font-size:11px;font-weight:600;padding:3px 10px;border-radius:4px;border:1px solid ${color}44;text-transform:uppercase;letter-spacing:0.05em;">${sev}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;">${event.type}</p>
            <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#f4f4f5;line-height:1.3;">${event.title}</h1>
            <p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;">${event.body}</p>

            ${dataRows ? `<table cellpadding="0" cellspacing="0" style="margin-bottom:24px;width:100%;">${dataRows}</table>` : ''}

            <!-- Metadata strip -->
            <table cellpadding="0" cellspacing="0" style="background:#0f0f11;border:1px solid #27272a;border-radius:6px;padding:12px 16px;width:100%;margin-bottom:28px;">
              <tr>
                <td style="font-size:12px;color:#52525b;">Org</td>
                <td style="font-size:12px;color:#71717a;font-family:ui-monospace,monospace;padding-left:12px;">${event.orgId}</td>
                <td style="font-size:12px;color:#52525b;padding-left:24px;">Time</td>
                <td style="font-size:12px;color:#71717a;padding-left:12px;">${ts}</td>
              </tr>
            </table>

            <a href="${dashboardUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:500;padding:10px 22px;border-radius:6px;text-decoration:none;">
              Open dashboard →
            </a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #27272a;">
            <p style="margin:0;font-size:12px;color:#52525b;">
              Sanctum Runtime · Manage alerts in
              <a href="${dashboardUrl}/settings" style="color:#3b82f6;text-decoration:none;">notification settings</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
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
  const html = buildHtml(event)
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

  // Structured log — searchable by any log drain
  console.error('[SANCTUM-OPS-ALERT] All notification channels failed:', JSON.stringify(payload))

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
      console.error('[SANCTUM-OPS-ALERT] Ops webhook returned', res.status)
    }
  } catch (e) {
    console.error('[SANCTUM-OPS-ALERT] Ops webhook unreachable:', e)
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

  // Primary channels participate in the failover logic
  type Channel = { name: string; fn: () => Promise<void> }
  const primary: Channel[] = []
  if (email)      primary.push({ name: 'email',   fn: () => sendResend(event, email) })
  if (slackUrl)   primary.push({ name: 'slack',   fn: () => sendSlack(event, slackUrl) })
  if (webhookUrl) primary.push({ name: 'webhook', fn: () => sendWebhook(event, webhookUrl) })

  if (primary.length === 0) {
    // No channels configured — loud log so this is discoverable
    console.warn(
      `[notifications] No channels configured — ${(event.severity ?? 'info').toUpperCase()} ` +
      `[${event.type}] org=${event.orgId}: ${event.title}`,
    )
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
        console.warn(`[notifications] ${primary[i].name} failed for ${event.type}:`, reason)
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
        console.warn(`[notifications] ${channel.name} failed, trying next channel:`, e)
      }
    }
    // Every configured channel failed
    await sendOpsAlert(event, failures)
  }

  // Web push is always attempted in parallel as a secondary channel.
  // Its failure does not trigger the ops alert — if no tokens are registered this is normal.
  void import('./fcm.js').then(async ({ sendFcmToOrg }) => {
    const { getSupabaseAuthConfig } = await import('./auth.js')
    const cfg = getSupabaseAuthConfig()
    if (!cfg) return
    await sendFcmToOrg(event, cfg)
  }).catch((e) => console.warn('[notifications] push error:', e))
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
    console.log(`[notifications] dedup state loaded (${data?.length ?? 0} entries)`)
  } catch (e) {
    console.warn('[notifications] dedup state load failed:', e)
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
    console.warn('[notifications] dedup persist failed:', e)
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
