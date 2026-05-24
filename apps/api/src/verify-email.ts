import { createHmac, timingSafeEqual } from 'crypto'
import {
  buttonRow,
  detailsTable,
  escapeHtml,
  plainText,
  severityBadge,
  spacer,
  wrapEmail,
} from './email-layout.js'

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim()
const FROM = process.env.NOTIFICATION_FROM_EMAIL?.trim() || 'Sanctum Runtime Alerts <alerts@sanctumruntime.com>'

function signingSecret(): string {
  const key =
    process.env.SANCTUM_API_KEY_PEPPER?.trim() ||
    process.env.SANCTUM_API_KEY?.trim()

  if (key) return key

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    process.env.SANCTUM_ENV === 'production'
  ) {
    throw new Error(
      'SANCTUM_API_KEY_PEPPER or SANCTUM_API_KEY must be set in production for email verification tokens',
    )
  }

  return 'dev-secret-change-me'
}

export function signVerifyToken(id: string, decision: 'APPROVED' | 'BLOCKED'): string {
  const exp = Date.now() + 24 * 3600 * 1000
  const payload = Buffer.from(JSON.stringify({ id, decision, exp })).toString('base64url')
  const sig = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyToken(token: string): { id: string; decision: 'APPROVED' | 'BLOCKED' } | null {
  try {
    const [payload, sig] = token.split('.')
    if (!payload || !sig) return null
    const expectedBuf = Buffer.from(createHmac('sha256', signingSecret()).update(payload).digest('base64url'))
    const sigBuf = Buffer.from(sig)
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { id: string; decision: 'APPROVED' | 'BLOCKED'; exp: number }
    if (Date.now() > data.exp) return null
    return { id: data.id, decision: data.decision }
  } catch {
    return null
  }
}

const RISK_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' } as const

export interface VerificationEmailContent {
  actor: string
  action: string
  context: Record<string, unknown>
  risk: string
  approveUrl: string
  blockUrl: string
}

export function buildVerificationEmail(content: VerificationEmailContent): { html: string; text: string } {
  const riskKey = (content.risk in RISK_COLORS ? content.risk : 'medium') as keyof typeof RISK_COLORS
  const riskColor = RISK_COLORS[riskKey]

  const contextRows: Array<[string, string]> = Object.entries(content.context)
    .filter(([k]) => !['org_id', 'orgId'].includes(k))
    .slice(0, 8)
    .map(([k, v]) => [k, String(v)])

  const allRows: Array<[string, string]> = [
    ['Agent', content.actor],
    ['Action', content.action],
    ['Risk', content.risk.toUpperCase()],
    ...contextRows,
  ]

  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const sections: string[] = [
    `<p style="margin:0 0 8px;font-size:11px;color:#52525b;text-transform:uppercase;letter-spacing:0.08em;font-family:${font};">Action approval required</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#f4f4f5;line-height:1.3;font-family:${font};">${escapeHtml(content.actor)} wants to <span style="color:${riskColor};">${escapeHtml(content.action)}</span></h1>`,
    `<p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;line-height:1.6;font-family:${font};">An AI agent has requested a sensitive action. Review the details below and respond. Either button records your decision and notifies the agent.</p>`,
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#0f0f11;border:1px solid #27272a;border-radius:8px;"><tr><td style="padding:16px 20px;">${detailsTable(allRows)}</td></tr></table>`,
    spacer(28),
    buttonRow([
      { text: 'Approve action', href: content.approveUrl, variant: 'success' },
      { text: 'Block action', href: content.blockUrl, variant: 'danger' },
    ]),
    spacer(20),
    `<p style="margin:0;font-size:12px;color:#71717a;line-height:1.5;font-family:${font};text-align:center;">Links expire in 24&nbsp;hours. Each link can only be used once.</p>`,
  ]

  const dashboardUrl = process.env.DASHBOARD_URL ?? 'https://console.sanctumruntime.com'
  return {
    html: wrapEmail({
      title: `Approval required: ${content.action}`,
      preheader: `${content.actor} wants to ${content.action} - risk ${content.risk.toUpperCase()}. Approve or block from your inbox.`,
      accentColor: riskColor,
      headerAccent: severityBadge(content.risk, riskColor),
      sections,
      footer:
        `Review activity at <a href="${escapeHtml(dashboardUrl)}" style="color:#3b82f6;text-decoration:none;">console.sanctumruntime.com</a> &middot; ` +
        `Manage approvals in <a href="${escapeHtml(dashboardUrl)}/settings" style="color:#3b82f6;text-decoration:none;">notification settings</a>`,
    }),
    text: plainText({
      title: `Approval required: ${content.action}`,
      body: `${content.actor} wants to ${content.action}. Risk: ${content.risk.toUpperCase()}.`,
      details: contextRows,
      actions: [
        { text: 'Approve', href: content.approveUrl },
        { text: 'Block', href: content.blockUrl },
      ],
      footer: 'Links expire in 24 hours. Each can only be used once.',
    }),
  }
}

export async function sendVerificationEmail(opts: {
  to: string
  actionId: string
  actor: string
  action: string
  context: Record<string, unknown>
  risk: string
  publicApiUrl: string
}): Promise<void> {
  if (!RESEND_API_KEY) return

  const approveToken = signVerifyToken(opts.actionId, 'APPROVED')
  const blockToken = signVerifyToken(opts.actionId, 'BLOCKED')
  const approveUrl = `${opts.publicApiUrl}/v1/verify-action?token=${approveToken}`
  const blockUrl = `${opts.publicApiUrl}/v1/verify-action?token=${blockToken}`
  const { html, text } = buildVerificationEmail({ ...opts, approveUrl, blockUrl })

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      subject: `[Action Required] ${opts.actor.slice(0, 60)} wants to ${opts.action.slice(0, 60)}`,
      html,
      text,
    }),
  })
}
