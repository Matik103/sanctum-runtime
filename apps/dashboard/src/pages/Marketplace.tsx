import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const loadingRef = useRef(false)

  const categories = useMemo(() => {
    const cats = Array.from(new Set(packages.map((p) => p.category).filter(Boolean))).sort()
    return cats
  }, [packages])

  const visiblePackages = useMemo(() => {
    if (categoryFilter === 'all') return packages
    return packages.filter((p) => p.category === categoryFilter)
  }, [packages, categoryFilter])

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
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      setPackages(await fetchMarketplacePackages(orgId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Marketplace unavailable')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    setPackages([])
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
        setSuccess(`Removed ${pkg.name} and its org policies from this organization`)
      } else {
        const result = await installMarketplacePackage(pkg.slug, orgId)
        setPackages((prev) =>
          prev.map((p) =>
            p.slug === pkg.slug
              ? { ...p, installed: true, installId: result.installId }
              : p,
          ),
        )
        const policyNote =
          result.appliedPolicyKeys && result.appliedPolicyKeys.length > 0
            ? ` · ${result.appliedPolicyKeys.length} org ${result.appliedPolicyKeys.length === 1 ? 'policy' : 'policies'} applied`
            : ''
        setSuccess(
          `${pkg.name} installed${policyNote}. Run connectFromPackage('${pkg.slug}', '${orgId}') or open Fleet.`,
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

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem 0', color: 'var(--muted)' }}>
          <Loader2 size={18} className="spin" />
          <span>Loading packages…</span>
        </div>
      ) : packages.length === 0 ? (
        <EmptyState
          title={orgId ? 'No packages' : 'Select an organization'}
          description={
            orgId
              ? 'Run npm run db:push to seed the 12-category catalog, or publish a package via API.'
              : 'Choose an organization above to browse the marketplace.'
          }
        />
      ) : (
        <>
          {categories.length > 1 && (
            <div className="toolbar" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`chip ${categoryFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCategoryFilter('all')}
              >
                All ({packages.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${categoryFilter === cat ? 'active' : ''}`}
                  onClick={() => setCategoryFilter(cat)}
                >
                  {cat} ({packages.filter((p) => p.category === cat).length})
                </button>
              ))}
            </div>
          )}
        <div className="policy-grid">
          {visiblePackages.map((pkg) => {
            const busy = busySlug === pkg.slug
            const installed = pkg.installed
            return (
              <article
                key={pkg.id}
                className={`policy-card marketplace-card ${installed ? 'marketplace-card--installed' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <Package size={16} style={{ flexShrink: 0, marginTop: '0.25rem', opacity: 0.5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0 }}>{pkg.name}</h3>
                      {installed && <span className="badge success">Installed</span>}
                    </div>
                    <p className="hint-line" style={{ margin: '0.15rem 0 0' }}>
                      {pkg.category}
                      {Array.isArray(pkg.policyTemplates) && pkg.policyTemplates.length > 0
                        ? ` · ${pkg.policyTemplates.length} policies`
                        : ''}
                    </p>
                  </div>
                </div>
                {pkg.description && (
                  <p style={{
                    margin: '0.5rem 0 0',
                    fontSize: '0.82rem',
                    color: 'var(--muted)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {pkg.description}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${installed ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => void toggleInstall(pkg)}
                    disabled={!orgId || busy}
                    aria-busy={busy}
                    style={{ flexShrink: 0 }}
                  >
                    {busy ? (
                      <><Loader2 size={13} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} className="spin" />{installed ? 'Removing…' : 'Installing…'}</>
                    ) : installed ? 'Uninstall' : 'Install'}
                  </button>
                  <code style={{ fontSize: '0.72rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    connectFromPackage('{pkg.slug}')
                  </code>
                </div>
              </article>
            )
          })}
        </div>
        </>
      )}
    </>
  )
}
