import { createHmac } from 'crypto'

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim()
const FROM = process.env.NOTIFICATION_FROM_EMAIL?.trim() || 'Sanctum Runtime Alerts <alerts@sanctumruntime.com>'

function signingSecret(): string {
  return process.env.SANCTUM_API_KEY_PEPPER?.trim()
    || process.env.SANCTUM_API_KEY?.trim()
    || 'dev-secret-change-me'
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
    const expected = createHmac('sha256', signingSecret()).update(payload).digest('base64url')
    if (expected !== sig) return null
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { id: string; decision: 'APPROVED' | 'BLOCKED'; exp: number }
    if (Date.now() > data.exp) return null
    return { id: data.id, decision: data.decision }
  } catch {
    return null
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

  const contextRows = Object.entries(opts.context)
    .filter(([k]) => !['org_id', 'orgId'].includes(k))
    .slice(0, 8)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#9ca3af;font-size:13px">${k}</td><td style="padding:4px 0;font-size:13px;color:#f9fafb">${String(v)}</td></tr>`)
    .join('')

  const riskColor = opts.risk === 'high' ? '#ef4444' : opts.risk === 'medium' ? '#f59e0b' : '#10b981'

  const html = `<!DOCTYPE html><html><body style="background:#070b14;font-family:Inter,sans-serif;padding:32px">
<div style="max-width:560px;margin:0 auto">
  <div style="background:#111827;border:1px solid rgba(148,163,184,0.12);border-top:3px solid #f59e0b;border-radius:12px;padding:28px">
    <h2 style="color:#f9fafb;margin:0 0 4px;font-size:20px">Action requires your approval</h2>
    <p style="color:#9ca3af;margin:0 0 20px;font-size:14px">An AI agent wants to perform a sensitive action. Review and decide.</p>
    <table style="width:100%;margin-bottom:20px">
      <tr><td style="padding:4px 12px 4px 0;color:#9ca3af;font-size:13px">Agent</td><td style="padding:4px 0;font-size:13px;color:#f9fafb">${opts.actor}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#9ca3af;font-size:13px">Action</td><td style="padding:4px 0;font-size:13px;color:#f9fafb"><strong>${opts.action}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#9ca3af;font-size:13px">Risk</td><td style="padding:4px 0;font-size:13px;color:${riskColor}">${opts.risk.toUpperCase()}</td></tr>
      ${contextRows}
    </table>
    <div style="display:flex;gap:12px;margin-bottom:20px">
      <a href="${approveUrl}" style="flex:1;display:inline-block;text-align:center;background:#10b981;color:#fff;text-decoration:none;padding:12px;border-radius:8px;font-weight:600;font-size:15px">✓ Approve</a>
      <a href="${blockUrl}" style="flex:1;display:inline-block;text-align:center;background:#ef4444;color:#fff;text-decoration:none;padding:12px;border-radius:8px;font-weight:600;font-size:15px">✗ Block</a>
    </div>
    <p style="color:#6b7280;font-size:12px;margin:0">Links expire in 24 hours. Each link can only be used once.</p>
  </div>
</div></body></html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      subject: `[Action Required] ${opts.actor} wants to ${opts.action}`,
      html,
    }),
  })
}
