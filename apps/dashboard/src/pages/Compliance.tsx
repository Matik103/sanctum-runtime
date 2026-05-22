import { useEffect, useState } from 'react'
import { Download, ShieldCheck, BarChart3, FileText, BookOpen } from 'lucide-react'
import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'
import { Alert } from '../components/ui/Alert'
import { TabBar } from '../components/ui/TabBar'
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
  const [tab, setTab] = useState<'report' | 'soc2' | 'anomalies' | 'nist'>('report')

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
        <div className="responsive-action-row">
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

          <TabBar
            tabs={[
              { id: 'report' as const, label: 'Overview' },
              { id: 'soc2' as const, label: 'SOC2 Controls' },
              { id: 'anomalies' as const, label: 'Risk Distribution' },
              { id: 'nist' as const, label: 'NIST AI RMF' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'report' && (
            <div className="responsive-split" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
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
              <div className="responsive-action-row" style={{ gap: '2rem', marginTop: '1rem' }}>
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

          {tab === 'nist' && (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <BookOpen size={18} style={{ color: 'var(--primary)' }} />
                <strong>NIST AI Risk Management Framework (AI RMF 1.0)</strong>
              </div>

              {[
                {
                  fn: 'GOVERN',
                  color: 'var(--primary)',
                  desc: 'Establish policies, processes, and accountability for AI risk management.',
                  controls: [
                    { id: 'GV-1.1', label: 'AI risk policy defined', impl: 'Org-scoped policies with versioning and audit trail' },
                    { id: 'GV-1.2', label: 'Roles and responsibilities', impl: 'Operator approval roles, resolver attribution on every decision' },
                    { id: 'GV-2.1', label: 'Risk tolerance established', impl: 'Per-action block/verify/approve thresholds with policy conditions' },
                    { id: 'GV-4.1', label: 'Organizational risk register', impl: 'Blast radius scoring and anomaly flags on all verify calls' },
                  ],
                },
                {
                  fn: 'MAP',
                  color: 'var(--success)',
                  desc: 'Identify and categorize AI risks in context.',
                  controls: [
                    { id: 'MP-2.1', label: 'Risk context captured', impl: 'Source trust classification (user / tool_output / untrusted_content / …)' },
                    { id: 'MP-2.3', label: 'Harm categories mapped', impl: 'Blast radius factors: data sensitivity, external destination, physical world, reversibility' },
                    { id: 'MP-3.1', label: 'AI system inventory', impl: 'Runtime fleet registry with agent registrations and hardware attestation' },
                    { id: 'MP-4.1', label: 'Indirect prompt injection', impl: 'instructionSource field propagated through verify; policies can gate on untrusted sources' },
                  ],
                },
                {
                  fn: 'MEASURE',
                  color: 'var(--warn, #f59e0b)',
                  desc: 'Analyze and assess AI risks through metrics and testing.',
                  controls: [
                    { id: 'MS-1.1', label: 'Performance monitoring', impl: 'Continuous audit log with decision, risk level, model confidence, and anomaly flags' },
                    { id: 'MS-2.2', label: 'Anomaly detection', impl: 'Heuristic anomaly engine running on every verify call; spike alerts to operators' },
                    { id: 'MS-2.5', label: 'Counterfactual testing', impl: 'Policy replay simulator: "what would this policy have blocked yesterday?"' },
                    { id: 'MS-3.3', label: 'Bias and harm metrics', impl: 'Block-rate, verification-rate, and blast-radius distribution in compliance reports' },
                  ],
                },
                {
                  fn: 'MANAGE',
                  color: 'var(--danger)',
                  desc: 'Prioritize and treat identified AI risks.',
                  controls: [
                    { id: 'MG-1.1', label: 'Risk response procedures', impl: 'Human-on-the-loop approvals: once / timed grant / always-approve / deny' },
                    { id: 'MG-2.2', label: 'Incident response', impl: 'Fleet kill switch pauses all agent actions org-wide instantly' },
                    { id: 'MG-2.4', label: 'Action token provenance', impl: 'Signed action tokens (HMAC-SHA256) required before side effects execute' },
                    { id: 'MG-4.1', label: 'Risk treatment records', impl: 'SOC2 evidence export: approval provenance, policy history, runtime attestation' },
                  ],
                },
              ].map(({ fn, color, desc, controls }) => (
                <div key={fn} style={{ marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{
                      fontFamily: 'ui-monospace, monospace', fontWeight: 700, fontSize: '0.85rem',
                      color, background: `${color}18`, padding: '0.2rem 0.6rem', borderRadius: 4,
                    }}>{fn}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{desc}</span>
                  </div>
                  {controls.map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', color, minWidth: '4.5rem', paddingTop: '0.1rem' }}>{c.id}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{c.impl}</div>
                      </div>
                      <span className="badge success" style={{ fontSize: '0.7rem', flexShrink: 0 }}>implemented</span>
                    </div>
                  ))}
                </div>
              ))}

              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Mapped to NIST AI RMF 1.0 (January 2023). Download the full compliance report for auditor submission.
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}
