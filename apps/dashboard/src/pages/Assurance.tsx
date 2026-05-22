import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, FileCheck2, KeyRound, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { TabBar } from '../components/ui/TabBar'
import {
  getEvidenceSummary,
  replayAudit,
  verifyActionToken,
  type AuditReplayResult,
  type EvidenceSummary,
} from '../lib/api'
import { decisionLabel, riskLabel } from '../lib/labels'
import { timeAgo } from '../lib/format'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'

type Tab = 'replay' | 'evidence' | 'tokens'

const CONTROL_LABELS: Record<string, string> = {
  actionVerification: 'Action verification',
  signedActionTokens: 'Signed action tokens',
  sourceTrustClassification: 'Source trust',
  blastRadiusScoring: 'Blast radius scoring',
  policyReplay: 'Policy replay',
  humanVerification: 'Human verification',
  auditTrail: 'Audit trail',
}

function pct(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function jsonPreview(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function Assurance() {
  const [tab, setTab] = useState<Tab>('replay')
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [limit, setLimit] = useState(100)
  const [replay, setReplay] = useState<AuditReplayResult | null>(null)
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null)
  const [token, setToken] = useState('')
  const [tokenResult, setTokenResult] = useState<{ valid: boolean; payload?: Record<string, unknown>; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list[0]) setOrgId(list[0].org_id)
    }).catch(() => {})
  }, [])

  const selectedOrg = orgId || undefined

  const loadAssurance = async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextReplay, nextEvidence] = await Promise.all([
        replayAudit(limit, selectedOrg),
        getEvidenceSummary(Math.max(limit, 200), selectedOrg),
      ])
      setReplay(nextReplay)
      setEvidence(nextEvidence)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assurance data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAssurance() }, [orgId])

  const controls = evidence?.controls ?? {}
  const controlsTotal = Object.keys(controls).length
  const controlsPassing = Object.values(controls).filter(Boolean).length
  const sampled = evidence?.auditWindow.sampledEvents ?? 0

  const tokenCoverage = useMemo(() => {
    if (!evidence) return '0%'
    return pct(evidence.auditWindow.signedApprovalTokens, evidence.auditWindow.approved)
  }, [evidence])

  const verifyToken = async () => {
    const trimmed = token.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      setTokenResult(await verifyActionToken(trimmed))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Assurance</h1>
          <p>Replay policies, gather evidence, and verify signed runtime approvals</p>
        </div>
        <div className="responsive-action-row">
          {orgs.length > 1 && (
            <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-label="Organization">
              {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
            </select>
          )}
          <input
            className="input"
            type="number"
            min={25}
            max={500}
            step={25}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            aria-label="Replay event limit"
            style={{ minWidth: '8rem' }}
          />
          <button type="button" className="btn btn-primary" onClick={() => void loadAssurance()} disabled={loading}>
            <RefreshCw size={15} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <Alert variant="error" onDismiss={() => setError(null)} style={{ marginBottom: '1rem' }}>{error}</Alert>}

      <div className="grid-4">
        <div className="card">
          <div className="card-label">Replay drift</div>
          <div className="card-value">{replay?.changedCount ?? 0}</div>
          <div className="card-meta">{replay?.count ?? 0} events re-evaluated</div>
        </div>
        <div className="card glow-success">
          <div className="card-label">Controls</div>
          <div className="card-value">{controlsPassing}/{controlsTotal || 0}</div>
          <div className="card-meta">runtime assurance checks passing</div>
        </div>
        <div className="card">
          <div className="card-label">Token coverage</div>
          <div className="card-value">{tokenCoverage}</div>
          <div className="card-meta">{evidence?.auditWindow.signedApprovalTokens ?? 0} signed approved actions</div>
        </div>
        <div className={`card ${(evidence?.auditWindow.highBlastRadiusEvents ?? 0) > 0 ? 'glow-danger' : ''}`}>
          <div className="card-label">High blast</div>
          <div className="card-value">{evidence?.auditWindow.highBlastRadiusEvents ?? 0}</div>
          <div className="card-meta">{evidence?.auditWindow.untrustedSourceEvents ?? 0} untrusted-source events</div>
        </div>
      </div>

      <TabBar
        tabs={[
          { id: 'replay' as const, label: 'Policy Replay', count: replay?.changedCount ?? 0 },
          { id: 'evidence' as const, label: 'Evidence', count: controlsPassing },
          { id: 'tokens' as const, label: 'Token Verify' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'replay' && (
        <section className="section">
          <div className="section__header">
            <h2>Replay results</h2>
            <p>Current policy logic re-evaluated against recent audit records.</p>
          </div>
          <div className="responsive-split" style={{ gridTemplateColumns: '0.75fr 1.25fr' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <RotateCcw size={17} />
                <strong>Decision mix</strong>
              </div>
              {(['APPROVED', 'REQUIRE_VERIFICATION', 'BLOCKED'] as const).map((decision) => (
                <div key={decision} className="assurance-meter">
                  <div>
                    <span>{decisionLabel(decision)}</span>
                    <strong>{replay?.decisions[decision] ?? 0}</strong>
                  </div>
                  <span style={{ width: pct(replay?.decisions[decision] ?? 0, replay?.count ?? 0) }} />
                </div>
              ))}
              {replay?.replayedAt && (
                <p className="hint-line" style={{ margin: '0.85rem 0 0' }}>Last replayed {timeAgo(replay.replayedAt)}</p>
              )}
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Action</th><th>Decision</th><th>Risk</th><th>Policy path</th></tr></thead>
                <tbody>
                  {!replay || replay.changed.length === 0 ? (
                    <tr><td colSpan={4} className="empty">No policy drift in the sampled audit window</td></tr>
                  ) : replay.changed.slice(0, 25).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <code style={{ fontSize: '0.78rem' }}>{c.action}</code>
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: '0.75rem', marginTop: '0.15rem' }}>{c.actor}</span>
                      </td>
                      <td>
                        <span className="badge neutral">{decisionLabel(c.previousDecision)}</span>
                        <span style={{ color: 'var(--muted)', padding: '0 0.35rem' }}>→</span>
                        <span className="badge warning">{decisionLabel(c.replayDecision)}</span>
                      </td>
                      <td>
                        <span className="badge neutral">{riskLabel(c.previousRisk)}</span>
                        <span style={{ color: 'var(--muted)', padding: '0 0.35rem' }}>→</span>
                        <span className={`badge ${c.replayRisk === 'high' ? 'danger' : c.replayRisk === 'medium' ? 'warning' : 'success'}`}>{riskLabel(c.replayRisk)}</span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{c.policyPath}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'evidence' && (
        <section className="section">
          <div className="section__header">
            <h2>Evidence package</h2>
            <p>Operational proof collected from policy state and the sampled audit window.</p>
          </div>
          <div className="responsive-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <ShieldCheck size={17} />
                <strong>Controls</strong>
              </div>
              <div className="assurance-list">
                {Object.entries(controls).map(([key, passing]) => (
                  <div key={key} className="assurance-list__row">
                    <span>{CONTROL_LABELS[key] ?? key}</span>
                    <span className={`badge ${passing ? 'success' : 'danger'}`}>{passing ? 'ready' : 'missing'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <FileCheck2 size={17} />
                <strong>Audit window</strong>
              </div>
              <div className="stat-strip">
                <div className="stat-strip__item"><p className="stat-strip__label">Sampled</p><p className="stat-strip__value">{sampled}</p></div>
                <div className="stat-strip__item"><p className="stat-strip__label">Approved</p><p className="stat-strip__value">{evidence?.auditWindow.approved ?? 0}</p></div>
                <div className="stat-strip__item"><p className="stat-strip__label">Blocked</p><p className="stat-strip__value">{evidence?.auditWindow.blocked ?? 0}</p></div>
                <div className="stat-strip__item"><p className="stat-strip__label">Review</p><p className="stat-strip__value">{evidence?.auditWindow.verificationRequired ?? 0}</p></div>
              </div>
              <ul className="assurance-evidence">
                {(evidence?.evidence ?? []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {tab === 'tokens' && (
        <section className="section">
          <div className="section__header">
            <h2>Action token verification</h2>
            <p>Validate that an executor is holding a live signed approval token before side effects run.</p>
          </div>
          <div className="responsive-split" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                <KeyRound size={17} />
                <strong>Paste token</strong>
              </div>
              <textarea
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="sanctum action token"
                rows={8}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
              />
              <div className="responsive-action-row" style={{ marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-primary" onClick={() => void verifyToken()} disabled={!token.trim() || loading}>
                  <BadgeCheck size={15} />
                  Verify token
                </button>
                <button type="button" className="btn" onClick={() => { setToken(''); setTokenResult(null) }}>Clear</button>
              </div>
            </div>
            <div className="card">
              <strong style={{ fontSize: '0.9rem' }}>Verification result</strong>
              {!tokenResult ? (
                <p className="hint-line" style={{ marginTop: '0.75rem' }}>Token results appear here after verification.</p>
              ) : (
                <>
                  <p style={{ marginTop: '0.75rem' }}>
                    <span className={`badge ${tokenResult.valid ? 'success' : 'danger'}`}>
                      {tokenResult.valid ? 'valid' : 'invalid'}
                    </span>
                  </p>
                  <pre className="code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {jsonPreview(tokenResult.payload ?? { error: tokenResult.error ?? 'Token rejected' })}
                  </pre>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
