import { useCallback, useEffect, useState } from 'react'
import { Loader2, Package } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { EmptyState } from '../components/ui/EmptyState'
import { PageActions } from '../components/ui/PageActions'
import {
  fetchMarketplacePackages,
  fetchMyOrgs,
  fetchOperatorContext,
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
  const [success, setSuccess] = useState<string | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      let list = await fetchMyOrgs()
      if (list.length === 0) {
        const ctx = await fetchOperatorContext()
        if (ctx?.defaultOrganizationId) {
          list = [
            {
              org_id: ctx.defaultOrganizationId,
              org_name: 'Workspace',
              role: 'owner',
            },
          ]
        }
      }
      setOrgs(list)
      if (list[0]) {
        setOrgId((prev) => prev || list[0].org_id)
      }
    })()
  }, [])

  const refresh = useCallback(async () => {
    if (!orgId) {
      setPackages([])
      return
    }
    try {
      setPackages(await fetchMarketplacePackages(orgId))
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
      setError('Select an organization first')
      setSuccess(null)
      return
    }
    setBusySlug(pkg.slug)
    setError(null)
    setSuccess(null)
    try {
      if (pkg.installed) {
        await uninstallMarketplacePackage(pkg.slug, orgId)
        setPackages((prev) =>
          prev.map((p) =>
            p.slug === pkg.slug ? { ...p, installed: false, installId: null } : p,
          ),
        )
        setSuccess(`Removed ${pkg.name} from this organization`)
      } else {
        const result = await installMarketplacePackage(pkg.slug, orgId)
        setPackages((prev) =>
          prev.map((p) =>
            p.slug === pkg.slug
              ? { ...p, installed: true, installId: result.installId }
              : p,
          ),
        )
        setSuccess(
          `${pkg.name} installed — run connectFromPackage('${pkg.slug}', '${orgId}') or open Fleet`,
        )
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
      await refresh()
    } finally {
      setBusySlug(null)
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
          {orgs.length > 0 ? (
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
          ) : (
            <span className="pill warn">No organization — sign in again</span>
          )}
        </PageActions>
      </header>

      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" onDismiss={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {!orgId && orgs.length === 0 && (
        <Alert variant="info">
          Sign in with Supabase to install packages. Your workspace organization is required.
        </Alert>
      )}

      {packages.length === 0 ? (
        <EmptyState
          title={orgId ? 'No packages' : 'Select an organization'}
          description={
            orgId
              ? 'Run db:push to seed the catalog, or publish an org-specific package via API.'
              : 'Choose an organization above to browse the marketplace.'
          }
        />
      ) : (
        <div className="policy-grid">
          {packages.map((pkg) => {
            const busy = busySlug === pkg.slug
            const installed = pkg.installed
            return (
              <article
                key={pkg.id}
                className={`policy-card marketplace-card ${installed ? 'marketplace-card--installed' : ''}`}
              >
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <Package size={20} style={{ flexShrink: 0, marginTop: '0.15rem' }} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.25rem' }}>{pkg.name}</h3>
                    <p className="hint-line" style={{ margin: 0 }}>
                      {pkg.slug} · v{pkg.version} · {pkg.category}
                    </p>
                  </div>
                  {installed && <span className="badge success">Installed</span>}
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
                  className={`btn btn-sm ${
                    installed ? 'btn-danger' : 'btn-primary'
                  }`}
                  onClick={() => void toggleInstall(pkg)}
                  disabled={!orgId || busy}
                  aria-busy={busy}
                >
                  {busy ? (
                    <>
                      <Loader2
                        size={14}
                        style={{ marginRight: '0.35rem', verticalAlign: 'middle' }}
                        className="spin"
                      />
                      {installed ? 'Removing…' : 'Installing…'}
                    </>
                  ) : installed ? (
                    'Uninstall'
                  ) : (
                    'Install'
                  )}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
