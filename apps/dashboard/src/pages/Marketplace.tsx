import { useCallback, useEffect, useState } from 'react'
import { Package } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import {
  fetchMarketplacePackages,
  fetchMyOrgs,
  installMarketplacePackage,
  uninstallMarketplacePackage,
  type FleetOrg,
  type MarketplacePackage,
} from '../lib/marketplace'

export function Marketplace() {
  const [packages, setPackages] = useState<MarketplacePackage[]>([])
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void fetchMyOrgs().then((list) => {
      setOrgs(list)
      if (list[0] && !orgId) setOrgId(list[0].org_id)
    })
  }, [orgId])

  const refresh = useCallback(async () => {
    try {
      setPackages(await fetchMarketplacePackages(orgId || undefined))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Marketplace unavailable')
    }
  }, [orgId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function toggleInstall(pkg: MarketplacePackage) {
    if (!orgId) {
      setMsg('Select an organization')
      return
    }
    try {
      if (pkg.installed) {
        await uninstallMarketplacePackage(pkg.slug, orgId)
        setMsg(`Removed ${pkg.name}`)
      } else {
        await installMarketplacePackage(pkg.slug, orgId)
        setMsg(`Installed ${pkg.name} — use connectFromPackage in SDK or Fleet`)
      }
      void refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Action failed')
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Marketplace</h1>
          <p>Runtime templates — install to your org, then connect with one call</p>
        </div>
        <PageActions>
          {orgs.length > 0 && (
            <select
              className="input"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organization"
              style={{ minWidth: '10rem' }}
            >
              {orgs.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.org_name}
                </option>
              ))}
            </select>
          )}
        </PageActions>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {msg && (
        <p style={{ marginBottom: '1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>{msg}</p>
      )}

      {packages.length === 0 ? (
        <EmptyState
          title="No packages"
          description="Run db:push to seed the catalog, or publish an org-specific package via API."
        />
      ) : (
        <div className="policy-grid">
          {packages.map((pkg) => (
            <article key={pkg.id} className="policy-card">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <Package size={20} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.25rem' }}>{pkg.name}</h3>
                  <p className="hint-line" style={{ margin: 0 }}>
                    {pkg.slug} · v{pkg.version} · {pkg.category}
                  </p>
                </div>
                {pkg.installed && <span className="badge success">Installed</span>}
              </div>
              {pkg.description && (
                <p style={{ margin: '0.5rem 0', fontSize: '0.85rem' }}>{pkg.description}</p>
              )}
              {pkg.readme && (
                <p style={{ margin: '0.35rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {pkg.readme}
                </p>
              )}
              <pre
                className="inline-code"
                style={{
                  display: 'block',
                  margin: '0.5rem 0',
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                }}
              >
                {`runtime.connectFromPackage('${pkg.slug}', '${orgId || 'your-org'}')`}
              </pre>
              <button
                type="button"
                className={`btn btn-sm ${pkg.installed ? 'btn-ghost' : 'btn-primary'}`}
                onClick={() => void toggleInstall(pkg)}
                disabled={!orgId}
              >
                {pkg.installed ? 'Uninstall' : 'Install'}
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
