import { describe, expect, it } from 'vitest'
import { buildNotificationEmailHtml, type NotificationEventType } from './notifications'

const notificationTypes: NotificationEventType[] = [
  'anomaly.spike',
  'agent.policy_violation',
  'agent.loop_detected',
  'agent.blocked_action',
  'shield.containment',
  'runtime.offline',
  'runtime.extended_offline',
  'runtime.tampered',
  'runtime.attestation_failed',
  'runtime.high_memory',
  'runtime.reconnected',
  'security.attestation_failed',
  'security.unauthorized_access',
  'security.api_abuse',
  'quota.warning',
  'quota.exceeded',
  'billing.plan_changed',
  'billing.payment_failed',
]

describe('notification email layout', () => {
  it.each(notificationTypes)('renders %s safely in the shared fluid layout', (type) => {
    const html = buildNotificationEmailHtml({
      type,
      orgId: 'org <primary>',
      title: 'Attention <script>alert("x")</script>',
      body: 'A boundary & destination need review.',
      data: { target: '<external>', count: 4 },
      severity: 'critical',
    })

    expect(html).toContain('width="100%" style="width:100%;max-width:600px')
    expect(html).toContain('Open dashboard')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;external&gt;')
    expect(html).toContain('org &lt;primary&gt;')
  })
})
