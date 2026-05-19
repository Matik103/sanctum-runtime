import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency'
export type AlertStatus = 'open' | 'acknowledged' | 'resolved'

export type Alert = {
  id: string
  org_id: string
  runtime_id: string | null
  severity: AlertSeverity
  type: string
  title: string
  message: string
  status: AlertStatus
  channels: string[]
  metadata: Record<string, unknown>
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
}

export type AlertRule = {
  id: string
  org_id: string
  name: string
  event_type: string
  threshold: number
  window_minutes: number
  severity: AlertSeverity
  channels: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export class AlertStore {
  constructor(private cfg: SupabaseAuthConfig) {}

  private db() {
    return createSupabaseAdmin(this.cfg)
  }

  async createAlert(data: {
    org_id: string
    runtime_id?: string
    severity: AlertSeverity
    type: string
    title: string
    message: string
    channels?: string[]
    metadata?: Record<string, unknown>
  }): Promise<Alert | null> {
    const { data: row, error } = await this.db()
      .from('alerts')
      .insert({
        org_id: data.org_id,
        runtime_id: data.runtime_id ?? null,
        severity: data.severity,
        type: data.type,
        title: data.title,
        message: data.message,
        channels: data.channels ?? [],
        metadata: data.metadata ?? {},
      })
      .select('*')
      .single()
    if (error) {
      console.warn('[alert-store] createAlert error:', error.message)
      return null
    }
    return row as Alert
  }

  async listAlerts(
    orgId: string,
    opts: {
      status?: AlertStatus | 'all'
      severity?: AlertSeverity
      limit?: number
      offset?: number
    } = {},
  ): Promise<Alert[]> {
    const limit = opts.limit ?? 100
    const offset = opts.offset ?? 0
    let q = this.db()
      .from('alerts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
    if (opts.severity) q = q.eq('severity', opts.severity)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []) as Alert[]
  }

  async acknowledgeAlert(alertId: string, orgId: string, by: string): Promise<Alert | null> {
    const { data, error } = await this.db()
      .from('alerts')
      .update({
        status: 'acknowledged',
        acknowledged_by: by,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('org_id', orgId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Alert
  }

  async resolveAlert(alertId: string, orgId: string, by: string): Promise<Alert | null> {
    const { data, error } = await this.db()
      .from('alerts')
      .update({
        status: 'resolved',
        resolved_by: by,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .eq('org_id', orgId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Alert
  }

  async stats(orgId: string): Promise<{
    open: number
    acknowledged: number
    critical: number
    emergency: number
  }> {
    const { data } = await this.db()
      .from('alerts')
      .select('status, severity')
      .eq('org_id', orgId)
      .neq('status', 'resolved')

    const rows = (data ?? []) as Array<{ status: string; severity: string }>
    return {
      open: rows.filter((r) => r.status === 'open').length,
      acknowledged: rows.filter((r) => r.status === 'acknowledged').length,
      critical: rows.filter((r) => r.severity === 'critical').length,
      emergency: rows.filter((r) => r.severity === 'emergency').length,
    }
  }

  async listRules(orgId: string): Promise<AlertRule[]> {
    const { data, error } = await this.db()
      .from('alert_rules')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []) as AlertRule[]
  }

  async createRule(data: {
    org_id: string
    name: string
    event_type: string
    threshold: number
    window_minutes: number
    severity: AlertSeverity
    channels: string[]
  }): Promise<AlertRule> {
    const { data: row, error } = await this.db()
      .from('alert_rules')
      .insert(data)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return row as AlertRule
  }

  async updateRule(
    ruleId: string,
    orgId: string,
    updates: Partial<{
      name: string
      threshold: number
      window_minutes: number
      severity: AlertSeverity
      channels: string[]
      is_active: boolean
    }>,
  ): Promise<AlertRule | null> {
    const { data, error } = await this.db()
      .from('alert_rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', ruleId)
      .eq('org_id', orgId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as AlertRule
  }

  async deleteRule(ruleId: string, orgId: string): Promise<void> {
    const { error } = await this.db()
      .from('alert_rules')
      .delete()
      .eq('id', ruleId)
      .eq('org_id', orgId)
    if (error) throw new Error(error.message)
  }
}
