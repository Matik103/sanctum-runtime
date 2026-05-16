import { useEffect, useState } from 'react'
import { BarChart3, Settings2 } from 'lucide-react'
import type { RuntimeStatus } from '@sanctum-runtime/sdk'
import { fetchMyOrgs, type FleetOrg } from '../lib/fleet'
import { riskModelMetaLine } from '../lib/risk-label'
import { fetchUsage, usageMetricLabel, type UsageSummary } from '../lib/usage'

type Props = { status: RuntimeStatus | null }

export function Settings({ status }: Props) {
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list[0]) setOrgId(list[0].org_id)
    })
  }, [])

  useEffect(() => {
    if (!orgId) return
    void fetchUsage(orgId, 30)
      .then(setUsage)
      .catch((e) => setUsageError(e instanceof Error ? e.message : 'Usage unavailable'))
  }, [orgId])
  const operational = status?.runtimeOnline !== false
  const provider = status?.riskProvider ?? (status?.ollamaConnected ? 'ollama' : 'none')
  const modelReady = status?.riskModelConnected ?? status?.ollamaConnected ?? false

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Runtime configuration and model connectivity</p>
        </div>
      </header>

      <section className="section">
        <div className="section__header">
          <h2>
            <Settings2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Runtime
          </h2>
          <p>{riskModelMetaLine(status)}</p>
        </div>
        <div className="section__body">
          <div className="stat-strip">
            <div className="stat-strip__item">
              <p className="stat-strip__label">API status</p>
              <p className="stat-strip__value">
                <span style={{ color: operational ? 'var(--success)' : 'var(--danger)' }}>
                  {operational ? 'Operational' : 'Unavailable'}
                </span>
              </p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Policies</p>
              <p className="stat-strip__value">{status?.policyCount ?? '—'}</p>
            </div>
            <div className="stat-strip__item">
              <p className="stat-strip__label">Audit entries</p>
              <p className="stat-strip__value">{status?.auditCount ?? '—'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__header">
          <h2>Risk model</h2>
          <p>Configure OPENAI_API_KEY or OLLAMA on the API host for live scoring</p>
        </div>
        <div className="section__body">
          <dl className="detail-list">
            <div>
              <dt>Provider</dt>
              <dd>{provider}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>
                <span className={`badge ${modelReady ? 'success' : 'neutral'}`}>
                  {modelReady ? 'Connected' : provider === 'none' ? 'Not configured' : 'Disconnected'}
                </span>
              </dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd style={{ wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>
                {status?.riskEndpoint ?? status?.ollamaUrl ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Active model</dt>
              <dd>{status?.riskModel ?? status?.ollamaModel ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </section>

      {orgs.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2>
              <BarChart3 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
              Usage (30 days)
            </h2>
            <p>Control-plane metering — billing integration coming later</p>
          </div>
          <div className="section__body">
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              style={{ marginBottom: '1rem', maxWidth: '16rem' }}
            >
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_name}
                </option>
              ))}
            </select>
            {usageError && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{usageError}</p>
            )}
            {usage && Object.keys(usage.totals).length === 0 && (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                No usage recorded yet — connect a runtime or verify an action.
              </p>
            )}
            {usage && Object.keys(usage.totals).length > 0 && (
              <div className="stat-strip">
                {Object.entries(usage.totals)
                  .sort(([, a], [, b]) => b - a)
                  .map(([metric, total]) => (
                    <div key={metric} className="stat-strip__item">
                      <p className="stat-strip__label">{usageMetricLabel(metric)}</p>
                      <p className="stat-strip__value">{Math.round(total)}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}
    </>
  )
}
