import { useEffect, useState } from 'react'
import { Play, FileCheck, KeyRound, Download } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { TabBar } from '../components/ui/TabBar'
import {
  replayAudit, getEvidenceSummary, verifyActionToken,
  type AuditReplayResult, type EvidenceSummary,
} from '../lib/api'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'

export function Assurance() {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [tab, setTab] = useState<'replay' | 'evidence' | 'token'>('replay')

  const [replay, setReplay] = useState<AuditReplayResult | null>(null)
  const [evidence, setEvidence] = useState<EvidenceSummary | null>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenResult, setTokenResult] = useState<{ valid: boolean; payload?: Record<string, unknown>; error?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list[0]) setOrgId(list[0].org_id)
    })
  }, [])

  const runReplay = async () => {
    setLoading(true); setError(null)
    try { setReplay(await replayAudit(200, orgId || undefined)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Replay failed') }
    finally { setLoading(false) }
  }

  const loadEvidence = async () => {
    setLoading(true); setError(null)
    try { setEvidence(await getEvidenceSummary(500, orgId || undefined)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Evidence load failed') }
    finally { setLoading(false) }
  }

  const verifyToken = async () => {
    setLoading(true); setError(null); setTokenResult(null)
    try { setTokenResult(await verifyActionToken(tokenInput.trim())) }
    catch (e) { setError(e instanceof Error ? e.message : 'Token verification failed') }
    finally { setLoading(false) }
  }

  const downloadEvidence = () => {
    if (!evidence) return
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sanctum-evidence-${evidence.orgId ?? 'all'}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Assurance</h1>
          <p>Replay history against new policies · evidence exports · action-token verification</p>
        </div>
        {orgs.length > 1 && (
          <select className="input" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">All orgs</option>
            {orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.org_name}</option>)}
          </select>
        )}
      </header>

      {error && <Alert variant="error" onDismiss={() => setError(null)} style={{ marginBottom: '1rem' }}>{error}</Alert>}

      <TabBar
        tabs={[
          { id: 'replay' as const, label: 'Policy Replay' },
          { id: 'evidence' as const, label: 'Evidence Export' },
          { id: 'token' as const, label: 'Token Verify' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'replay' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <strong>"If today's policies had existed yesterday…"</strong>
            <button type="button" className="btn btn-primary" onClick={() => void runReplay()} disabled={loading}>
              <Play size={14} style={{ marginRight: '0.35rem' }} /> Replay last 200
            </button>
          </div>
          {!replay && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Run a replay to see how many past decisions would change under your current policy set.</p>}
          {replay && (
            <>
              <div className="grid-4" style={{ marginBottom: '1rem' }}>
                <div className="card"><div className="card-label">Replayed</div><div className="card-value">{replay.count}</div></div>
                <div className={`card ${replay.changedCount > 0 ? 'glow-warn' : ''}`}><div className="card-label">Would change</div><div className="card-value">{replay.changedCount}</div></div>
                <div className="card"><div className="card-label">Would approve</div><div className="card-value">{replay.decisions.APPROVED ?? 0}</div></div>
                <div className="card glow-danger"><div className="card-label">Would block</div><div className="card-value">{replay.decisions.BLOCKED ?? 0}</div></div>
              </div>
              {replay.changed.length > 0 && (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Action</th><th>Actor</th><th>Was</th><th>Would be</th><th>Policy</th></tr></thead>
                    <tbody>
                      {replay.changed.slice(0, 50).map((c) => (
                        <tr key={c.id}>
                          <td><code style={{ fontSize: '0.8rem' }}>{c.action}</code></td>
                          <td style={{ fontSize: '0.8rem' }}>{c.actor}</td>
                          <td><span className="badge neutral">{c.previousDecision}</span></td>
                          <td><span className={`badge ${c.replayDecision === 'BLOCKED' ? 'danger' : c.replayDecision === 'REQUIRE_VERIFICATION' ? 'warn' : 'success'}`}>{c.replayDecision}</span></td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{c.policyPath}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'evidence' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <strong>SOC2 / NIST AI RMF evidence summary</strong>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => void loadEvidence()} disabled={loading}>
                <FileCheck size={14} style={{ marginRight: '0.35rem' }} /> Generate
              </button>
              {evidence && (
                <button type="button" className="btn" onClick={downloadEvidence}>
                  <Download size={14} style={{ marginRight: '0.35rem' }} /> Download JSON
                </button>
              )}
            </div>
          </div>
          {!evidence && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Generate evidence to surface control coverage for auditors.</p>}
          {evidence && (
            <>
              <div className="grid-4" style={{ marginBottom: '1rem' }}>
                <div className="card"><div className="card-label">Sampled events</div><div className="card-value">{evidence.auditWindow.sampledEvents}</div></div>
                <div className="card glow-success"><div className="card-label">Signed tokens</div><div className="card-value">{evidence.auditWindow.signedApprovalTokens}</div></div>
                <div className="card glow-danger"><div className="card-label">High blast</div><div className="card-value">{evidence.auditWindow.highBlastRadiusEvents}</div></div>
                <div className="card glow-warn"><div className="card-label">Untrusted src</div><div className="card-value">{evidence.auditWindow.untrustedSourceEvents}</div></div>
              </div>
              <div style={{ marginBottom: '0.85rem' }}>
                {Object.entries(evidence.controls).map(([ctl, on]) => (
                  <div key={ctl} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{ctl.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className={`badge ${on ? 'success' : 'warn'}`}>{on ? 'implemented' : 'not implemented'}</span>
                  </div>
                ))}
              </div>
              <ul style={{ margin: 0, padding: '0 0 0 1.25rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                {evidence.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'token' && (
        <div className="card">
          <strong>Verify a Sanctum action token</strong>
          <p style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.25rem' }}>
            Paste a signed action token from a downstream executor to confirm its actor, action, scope and expiry.
          </p>
          <textarea
            className="input"
            rows={3}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIs..."
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.78rem', margin: '0.75rem 0' }}
          />
          <button type="button" className="btn btn-primary" onClick={() => void verifyToken()} disabled={loading || !tokenInput.trim()}>
            <KeyRound size={14} style={{ marginRight: '0.35rem' }} /> Verify
          </button>
          {tokenResult && (
            <div style={{ marginTop: '0.85rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <span className={`badge ${tokenResult.valid ? 'success' : 'danger'}`}>
                  {tokenResult.valid ? 'Valid' : 'Invalid'}
                </span>
                {tokenResult.error && <span style={{ marginLeft: '0.5rem', fontSize: '0.82rem', color: 'var(--danger)' }}>{tokenResult.error}</span>}
              </div>
              {tokenResult.payload && (
                <pre style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(tokenResult.payload, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
