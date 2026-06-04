import { useCallback, useEffect, useState } from 'react'
import { Globe, Shield } from 'lucide-react'
import { Alert } from '../ui/Alert'
import {
  addOrgDomain,
  fetchOrgDomains,
  removeOrgDomain,
  verifyOrgDomain,
  type OrgDomain,
} from '../../lib/org-domains'
import { pricingUrl } from '../../lib/site-links'

type Props = {
  orgId: string
  editable: boolean
  isPersonalWorkspace: boolean
}

export function DomainVerificationSection({ orgId, editable, isPersonalWorkspace }: Props) {
  const [domains, setDomains] = useState<OrgDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [planBlocked, setPlanBlocked] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pendingDns, setPendingDns] = useState<{
    domain: string
    dns_host: string
    dns_txt_value: string
  } | null>(null)

  const load = useCallback(async () => {
    if (!orgId || isPersonalWorkspace) {
      setLoading(false)
      return
    }
    setLoading(true)
    setPlanBlocked(false)
    try {
      const list = await fetchOrgDomains(orgId)
      setDomains(list)
    } catch (e) {
      if (e instanceof Error && (e as Error & { code?: string }).code === 'plan_feature_required') {
        setPlanBlocked(true)
        setDomains([])
      }
    } finally {
      setLoading(false)
    }
  }, [orgId, isPersonalWorkspace])

  useEffect(() => {
    void load()
  }, [load])

  if (isPersonalWorkspace) return null

  const handleAdd = async () => {
    setMsg(null)
    setBusy(true)
    try {
      const created = await addOrgDomain(orgId, newDomain)
      setPendingDns({
        domain: created.domain,
        dns_host: created.dns_host,
        dns_txt_value: created.dns_txt_value,
      })
      setNewDomain('')
      setMsg(`Domain ${created.domain} added. Add the DNS TXT record below, then verify.`)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not add domain')
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async (domain: string) => {
    setMsg(null)
    setBusy(true)
    try {
      await verifyOrgDomain(orgId, domain)
      setPendingDns(null)
      setMsg(`Domain ${domain} verified. Company SSO users with @${domain} emails can sign in.`)
      await load()
    } catch (e) {
      const err = e as Error & { dns_host?: string; dns_txt_value?: string }
      if (err.dns_host && err.dns_txt_value) {
        setPendingDns({ domain, dns_host: err.dns_host, dns_txt_value: err.dns_txt_value })
      }
      setMsg(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async (domain: string) => {
    if (!window.confirm(`Remove domain ${domain}? SSO auto-join will stop for this domain.`)) return
    setBusy(true)
    try {
      await removeOrgDomain(orgId, domain)
      setMsg(`Domain ${domain} removed.`)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section" id="company-sso-domains">
      <div className="section__header">
        <h2>
          <Shield size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
          Company SSO domains
        </h2>
        <p>
          Verify ownership of your work email domain so employees can sign in with Google or GitHub
          under <strong>Company SSO</strong>.
        </p>
      </div>
      <div className="section__body">
        {msg && (
          <Alert
            variant={msg.includes('verified') || msg.includes('added') ? 'success' : 'error'}
            onDismiss={() => setMsg(null)}
          >
            {msg}
          </Alert>
        )}

        {planBlocked && (
          <div className="domain-plan-callout">
            <p>
              Verified domains and Company SSO auto-join are available on the <strong>Team</strong>{' '}
              plan and above.
            </p>
            <a href={pricingUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
              View plans
            </a>
          </div>
        )}

        {!planBlocked && editable && (
          <div style={{ maxWidth: '28rem', marginBottom: '1.25rem' }}>
            <label className="settings-label">Add work email domain</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                type="text"
                placeholder="yourcompany.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleAdd()}>
                Add
              </button>
            </div>
            <p className="hint-line" style={{ marginTop: '0.5rem' }}>
              Use your corporate domain only (not gmail.com, outlook.com, etc.).
            </p>
          </div>
        )}

        {pendingDns && (
          <div className="domain-dns-card">
            <p className="domain-dns-card__title">
              <Globe size={16} /> DNS verification for <strong>{pendingDns.domain}</strong>
            </p>
            <p className="hint-line">Add this TXT record at your DNS provider (same pattern as Google Workspace / Atlassian):</p>
            <dl className="domain-dns-dl">
              <div>
                <dt>Host / name</dt>
                <dd>
                  <code className="inline-code">{pendingDns.dns_host}</code>
                </dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>TXT</dd>
              </div>
              <div>
                <dt>Value</dt>
                <dd>
                  <code className="inline-code domain-dns-dl__value">{pendingDns.dns_txt_value}</code>
                </dd>
              </div>
            </dl>
            {editable && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void handleVerify(pendingDns.domain)}
              >
                {busy ? 'Checking DNS…' : 'Verify DNS record'}
              </button>
            )}
          </div>
        )}

        {loading && <p className="hint-line">Loading domains…</p>}

        {!loading && !planBlocked && domains.length === 0 && !pendingDns && (
          <p className="hint-line">No domains registered yet.</p>
        )}

        {domains.length > 0 && (
          <table className="domain-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Status</th>
                <th>Verified</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domain}>
                  <td>
                    <code className="inline-code">@{d.domain}</code>
                  </td>
                  <td>
                    <span className={`badge ${d.verified ? 'success' : 'neutral'}`}>
                      {d.verified ? 'Verified' : 'Pending DNS'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {d.verified_at ? new Date(d.verified_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {editable && !d.verified && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy}
                        onClick={() => void handleVerify(d.domain)}
                      >
                        Verify
                      </button>
                    )}
                    {editable && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ color: 'var(--danger)', marginLeft: '0.25rem' }}
                        disabled={busy}
                        onClick={() => void handleRemove(d.domain)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
