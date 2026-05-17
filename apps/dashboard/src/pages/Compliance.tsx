import { useEffect, useState } from 'react'
import { Download, ShieldCheck, BarChart3, FileText } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { Alert } from '../components/ui/Alert'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'

type ComplianceReport = {
  period: { start: string; end: string }
  summary: {
    total_actions: number
    blocked_actions: number
    verified_actions: number
    anomaly_flags: number
    human_reviews: number
    approval_rate_pct: number
  }
  policy_changes: Array<{ action: string; change_type: string; timestamp: string }>
  runtime_uptime: Array<{ runtime_id: string; uptime_pct: number; total_hours: number }>
  risk_distribution: { LOW: number; MEDIUM: number; HIGH: number }
  soc2_controls?: {
    CC6_1: string  // Access controls
    CC7_1: string  // Change management
    CC7_2: string  // Anomaly detection
    A1_1: string   // Availability
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function ControlRow({ id, description, status }: { id: string; description: string; status: string }) {
  const passing = status === 'passing' || status === 'implemented'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem', color: 'var(--primary)', marginRight: '0.75rem' }}>{id}</span>
        <span style={{ fontSize: '0.85rem' }}>{description}</span>
      </div>
      <span className={`badge ${passing ? 'success' : 'warn'}`}>{status}</span>
    </div>
  )
}

export function Compliance() {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [soc2, setSoc2] = useState<Record<string, string> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'report' | 'soc2' | 'anomalies'>('report')

  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const [startDate, setStartDate] = useState(thirtyDaysAgo.toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(today.toISOString().slice(0, 10))

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list[0]) setOrgId(list[0].org_id)
    })
  }, [])

  const loadReport = async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)
    try {
      const h = await authHeaders()
      const [rRes, sRes] = await Promise.all([
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/compliance/report?start=${startDate}&end=${endDate}`, { headers: h }),
        fetch(`${apiBaseUrl}/v1/orgs/${orgId}/compliance/soc2`, { headers: h }),
      ])
      if (rRes.ok) setReport(await rRes.json() as ComplianceReport)
      else if (rRes.status !== 404) setError(`Report failed: ${rRes.status}`)
      if (sRes.ok) setSoc2(await sRes.json() as Record<string, string>)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load compliance data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadReport() }, [orgId])

  const downloadReport = async () => {
    if (!orgId) return
    const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/compliance/report.pdf?start=${startDate}&end=${endDate}`, {
      headers: await authHeaders(),
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sanctum-compliance-${orgId}-${startDate}-${endDate}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalActions = report?.summary.total_actions ?? 0
  const blockRate = totalActions ? Math.round((report!.summary.blocked_actions / totalActions) * 100) : 0
  const riskTotal = report ? Object.values(report.risk_distribution).reduce((a, b) => a + b, 0) : 0

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Compliance</h1>
          <p>SOC2, audit evidence, and compliance reporting</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>→</span>
          <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ fontSize: '0.85rem' }} />
          <button type="button" className="btn btn-primary" onClick={() => void loadReport()} disabled={loading}>
            {loading ? 'Loading…' : 'Run report'}
          </button>
          <button type="button" className="btn" onClick={() => void downloadReport()} title="Download report">
            <Download size={15} />
          </button>
        </div>
      </header>

      {orgs.length > 1 && (
        <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)} style={{ marginBottom: '1rem', maxWidth: '16rem' }}>
          {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
        </select>
      )}

      {error && <Alert variant="error" onDismiss={() => setError(null)} style={{ marginBottom: '1rem' }}>{error}</Alert>}

      {!report && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted)' }}>
          <FileText size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
          <p>Run a report to see compliance data for this period.</p>
        </div>
      )}

      {report && (
        <>
          <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-label">Total actions</div>
              <div className="card-value">{totalActions.toLocaleString()}</div>
              <div className="card-meta">{startDate} → {endDate}</div>
            </div>
            <div className={`card ${blockRate > 10 ? 'glow-danger' : ''}`}>
              <div className="card-label">Block rate</div>
              <div className="card-value">{blockRate}%</div>
              <div className="card-meta">{report.summary.blocked_actions.toLocaleString()} blocked</div>
            </div>
            <div className="card">
              <div className="card-label">Human reviews</div>
              <div className="card-value">{report.summary.human_reviews.toLocaleString()}</div>
              <div className="card-meta">{report.summary.verified_actions} held for verification</div>
            </div>
            <div className="card glow-success">
              <div className="card-label">Approval rate</div>
              <div className="card-value">{report.summary.approval_rate_pct}%</div>
              <div className="card-meta">{report.summary.anomaly_flags} anomaly flags</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {(['report', 'soc2', 'anomalies'] as const).map((t) => (
              <button key={t} type="button" className={`btn ${tab === t ? 'btn-primary' : ''}`} onClick={() => setTab(t)}>
                {t === 'report' ? <><BarChart3 size={13} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />Overview</> :
                 t === 'soc2' ? <><ShieldCheck size={13} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />SOC2 Controls</> :
                 'Risk distribution'}
              </button>
            ))}
          </div>

          {tab === 'report' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div className="table-wrap">
                <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Policy changes</strong>
                </div>
                <table className="data">
                  <thead><tr><th>Action</th><th>Change</th><th>When</th></tr></thead>
                  <tbody>
                    {report.policy_changes.length === 0
                      ? <tr><td colSpan={3} className="empty">No policy changes in this period</td></tr>
                      : report.policy_changes.slice(0, 20).map((c, i) => (
                        <tr key={i}>
                          <td><code style={{ fontSize: '0.8rem' }}>{c.action}</code></td>
                          <td><span className="badge neutral">{c.change_type}</span></td>
                          <td style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{new Date(c.timestamp).toLocaleDateString()}</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ fontSize: '0.9rem' }}>Runtime uptime</strong>
                </div>
                <table className="data">
                  <thead><tr><th>Runtime</th><th>Uptime</th><th>Hours</th></tr></thead>
                  <tbody>
                    {report.runtime_uptime.length === 0
                      ? <tr><td colSpan={3} className="empty">No runtime data</td></tr>
                      : report.runtime_uptime.map((r) => (
                        <tr key={r.runtime_id}>
                          <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.8rem' }}>{r.runtime_id.slice(0, 12)}…</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${r.uptime_pct}%`, height: '100%', background: r.uptime_pct > 99 ? 'var(--success)' : r.uptime_pct > 95 ? 'var(--warn, #f59e0b)' : 'var(--danger)' }} />
                              </div>
                              <span style={{ fontSize: '0.8rem' }}>{r.uptime_pct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{Math.round(r.total_hours)}h</td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'soc2' && soc2 && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
                <strong>SOC2 Trust Services Criteria Evidence</strong>
              </div>
              <ControlRow id="CC6.1" description="Logical and physical access controls" status={soc2['CC6_1'] ?? 'implemented'} />
              <ControlRow id="CC7.1" description="Change management — policy and configuration changes" status={soc2['CC7_1'] ?? 'implemented'} />
              <ControlRow id="CC7.2" description="Anomaly detection and incident response" status={soc2['CC7_2'] ?? 'implemented'} />
              <ControlRow id="A1.1" description="System availability and runtime monitoring" status={soc2['A1_1'] ?? 'implemented'} />
              <ControlRow id="CC9.2" description="Vendor risk — third-party AI model evaluation" status={soc2['CC9_2'] ?? 'implemented'} />
              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Evidence generated from audit logs, policy history, and runtime telemetry. Download the full report for auditor submission.
              </p>
            </div>
          )}

          {tab === 'anomalies' && (
            <div className="card">
              <strong style={{ fontSize: '0.9rem' }}>Risk distribution</strong>
              <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                {Object.entries(report.risk_distribution).map(([level, count]) => (
                  <div key={level} style={{ textAlign: 'center' }}>
                    <div style={{
                      fontSize: '2rem', fontWeight: 700,
                      color: level === 'HIGH' ? 'var(--danger)' : level === 'MEDIUM' ? 'var(--warn, #f59e0b)' : 'var(--success)',
                    }}>{count}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{level}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {riskTotal ? Math.round((count / riskTotal) * 100) : 0}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
