import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Package } from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { formatApiError } from '../lib/sanitize-error'
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

const STARTER_PACKS = [
  {
    id: 'agent',
    title: 'Coding & workflow agents',
    description: 'Gate tool calls for dev agents, MCP servers, and API operators.',
    match: (p: MarketplacePackage) => /agent|coding|workflow|mcp|dev/i.test(`${p.category} ${p.name} ${p.slug}`),
  },
  {
    id: 'finance',
    title: 'Finance & transfers',
    description: 'Hold high-value payments, transfers, and billing actions.',
    match: (p: MarketplacePackage) => /finance|payment|transfer|billing|bank/i.test(`${p.category} ${p.name} ${p.slug}`),
  },
  {
    id: 'physical',
    title: 'Physical & access control',
    description: 'Verify door unlocks, robotics, and environment actions.',
    match: (p: MarketplacePackage) => /physical|robot|door|access|iot|home/i.test(`${p.category} ${p.name} ${p.slug}`),
  },
] as const

export function Marketplace() {
  const [packages, setPackages] = useState<MarketplacePackage[]>([])
  const [orgs, setOrgs] = useState<FleetOrg[]>([])
  const [orgId, setOrgId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busySlug, setBusySlug] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [starterPack, setStarterPack] = useState<string | null>(null)
  const [detailPkg, setDetailPkg] = useState<MarketplacePackage | null>(null)
  const loadingRef = useRef(false)
  const orgIdRef = useRef(orgId)
  orgIdRef.current = orgId

  const categories = useMemo(() => {
    const cats = Array.from(new Set(packages.map((p) => p.category).filter(Boolean))).sort()
    return cats
  }, [packages])

  const visiblePackages = useMemo(() => {
    let list = packages
    if (starterPack) {
      const pack = STARTER_PACKS.find((s) => s.id === starterPack)
      if (pack) list = list.filter(pack.match)
    } else if (categoryFilter !== 'all') {
      list = list.filter((p) => p.category === categoryFilter)
    }
    return list
  }, [packages, categoryFilter, starterPack])

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
      setError(formatApiError(e, 'Marketplace unavailable'))
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
    const targetOrg = orgId
    // Org switched while the request was in flight — drop the stale update.
    const staleOrg = () => orgIdRef.current !== targetOrg
    setBusySlug(pkg.slug)
    setError(null)
    setSuccess(null)
    try {
      if (pkg.installed) {
        await uninstallMarketplacePackage(pkg.slug, targetOrg)
        if (staleOrg()) return
        setPackages((prev) =>
          prev.map((p) =>
            p.slug === pkg.slug ? { ...p, installed: false, installId: null } : p,
          ),
        )
        setSuccess(`Removed ${pkg.name} and its org policies from this organization`)
      } else {
        const result = await installMarketplacePackage(pkg.slug, targetOrg)
        if (staleOrg()) return
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
      if (!staleOrg()) {
        setError(formatApiError(e, 'Action failed'))
        await refresh()
      }
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

      {error && <PlanGateAlert message={error} onDismiss={() => setError(null)} />}
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
          title={orgId ? 'No packages available' : 'Select an organization'}
          description={
            orgId
              ? 'No packages are available for this organization. Contact your administrator to enable the package catalog.'
              : 'Choose an organization above to browse available packages.'
          }
        />
      ) : (
        <>
          <div className="marketplace-starter-packs">
            {STARTER_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className={`marketplace-starter-pack${starterPack === pack.id ? ' marketplace-starter-pack--active' : ''}`}
                onClick={() => {
                  setStarterPack((cur) => (cur === pack.id ? null : pack.id))
                  setCategoryFilter('all')
                }}
              >
                <strong>{pack.title}</strong>
                <span>{pack.description}</span>
              </button>
            ))}
          </div>
          {categories.length > 1 && (
            <div className="toolbar marketplace-filters">
              <button
                type="button"
                className={`chip ${categoryFilter === 'all' && !starterPack ? 'active' : ''}`}
                onClick={() => { setCategoryFilter('all'); setStarterPack(null) }}
              >
                All ({packages.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`chip ${categoryFilter === cat && !starterPack ? 'active' : ''}`}
                  onClick={() => { setCategoryFilter(cat); setStarterPack(null) }}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDetailPkg(pkg)}>
                    Details
                  </button>
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

      {detailPkg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setDetailPkg(null)}>
          <div className="card" style={{ width: 'min(520px, 100%)', maxHeight: '85vh', overflow: 'auto', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{detailPkg.name}</h2>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>{detailPkg.category} · v{detailPkg.version} · {detailPkg.publisher}</p>
              </div>
              {detailPkg.installed && <span className="badge success">Installed</span>}
            </div>
            {detailPkg.description && <p style={{ fontSize: '0.88rem', lineHeight: 1.55 }}>{detailPkg.description}</p>}
            {detailPkg.readme && (
              <pre style={{ fontSize: '0.78rem', whiteSpace: 'pre-wrap', marginTop: '0.75rem', background: 'var(--surface-2)', padding: '0.75rem', borderRadius: 8 }}>{detailPkg.readme}</pre>
            )}
            {Array.isArray(detailPkg.policyTemplates) && detailPkg.policyTemplates.length > 0 && (
              <div style={{ marginTop: '0.85rem' }}>
                <strong style={{ fontSize: '0.82rem' }}>Policy templates ({detailPkg.policyTemplates.length})</strong>
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
                  {detailPkg.policyTemplates.slice(0, 12).map((t, i) => (
                    <li key={i}>{typeof t === 'object' && t && 'action' in t ? String((t as { action?: string }).action) : `Policy ${i + 1}`}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button type="button" className={`btn ${detailPkg.installed ? 'btn-danger' : 'btn-primary'}`} onClick={() => { void toggleInstall(detailPkg); setDetailPkg(null) }}>
                {detailPkg.installed ? 'Uninstall' : 'Install to org'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDetailPkg(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
