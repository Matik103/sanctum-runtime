import { lazy, Suspense, useCallback, useState, useEffect } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { ActionDrawer } from './components/ActionDrawer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PwaInstallBanner } from './components/PwaInstallBanner'
import { useCompanionMode } from './hooks/useCompanionMode'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { ReviewQueueBanner, summarizePendingActions } from './components/ReviewQueueBanner'
import { VerificationModal } from './components/VerificationModal'
import { useDashboard } from './hooks/useDashboard'
import { MainCanvas } from './layout/MainCanvas'
import { Sidebar, type PageId } from './layout/Sidebar'
import { useHeldCount } from './hooks/useHeldCount'
import { useConsolePersona } from './hooks/useConsolePersona'
import { getFleetStatus, type FleetPauseStatus } from './lib/api'
import { Overview } from './pages/Overview'
import { fetchMyOrgs } from './lib/fleet'
import { useOfflineQueue } from './hooks/useOfflineQueue'
import { PlanGateAlert } from './components/PlanGateAlert'
import { formatApiError } from './lib/sanitize-error'
import { buildPageUrl, type NavigateQuery } from './lib/navigate'

const RuntimeActivity = lazy(() => import('./pages/RuntimeActivity').then((m) => ({ default: m.RuntimeActivity })))
const ThreatMonitor = lazy(() => import('./pages/ThreatMonitor').then((m) => ({ default: m.ThreatMonitor })))
const ShieldPage = lazy(() => import('./pages/Shield').then((m) => ({ default: m.Shield })))
const ShieldRulesPage = lazy(() => import('./pages/ShieldRules').then((m) => ({ default: m.ShieldRules })))
const Agents = lazy(() => import('./pages/Agents').then((m) => ({ default: m.Agents })))
const Alerts = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })))
const Policies = lazy(() => import('./pages/Policies').then((m) => ({ default: m.Policies })))
const PolicyHistory = lazy(() => import('./pages/PolicyHistory').then((m) => ({ default: m.PolicyHistory })))
const WorkflowBuilder = lazy(() => import('./pages/WorkflowBuilder').then((m) => ({ default: m.WorkflowBuilder })))
const Assurance = lazy(() => import('./pages/Assurance').then((m) => ({ default: m.Assurance })))
const Governance = lazy(() => import('./pages/Governance').then((m) => ({ default: m.Governance })))
const Permissions = lazy(() => import('./pages/Permissions').then((m) => ({ default: m.Permissions })))
const Compliance = lazy(() => import('./pages/Compliance').then((m) => ({ default: m.Compliance })))
const Devices = lazy(() => import('./pages/Devices').then((m) => ({ default: m.Devices })))
const Fleet = lazy(() => import('./pages/Fleet').then((m) => ({ default: m.Fleet })))
const Marketplace = lazy(() => import('./pages/Marketplace').then((m) => ({ default: m.Marketplace })))
const AuditLogs = lazy(() => import('./pages/AuditLogs').then((m) => ({ default: m.AuditLogs })))
const Billing = lazy(() => import('./pages/Billing').then((m) => ({ default: m.Billing })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Connect = lazy(() => import('./pages/Connect').then((m) => ({ default: m.Connect })))
const LiveFeed = lazy(() => import('./pages/LiveFeed').then((m) => ({ default: m.LiveFeed })))

const PAGE_IDS: PageId[] = [
  'overview',
  'activity',
  'threats',
  'shield',
  'shield-rules',
  'alerts',
  'policies',
  'policy-history',
  'workflow-builder',
  'assurance',
  'governance',
  'permissions',
  'compliance',
  'agents',
  'devices',
  'fleet',
  'marketplace',
  'audit',
  'billing',
  'settings',
  'connect',
  'live-feed',
]

function redirectLegacySupportInbox() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('page') !== 'support-inbox') return false
  const session = params.get('session')
  const target = `/support${session ? `?session=${encodeURIComponent(session)}` : ''}`
  window.location.replace(target)
  return true
}

function initialPage(): PageId {
  if (typeof window === 'undefined') return 'overview'
  if (redirectLegacySupportInbox()) return 'overview'
  const requested = new URLSearchParams(window.location.search).get('page') as PageId | null
  return requested && PAGE_IDS.includes(requested) ? requested : 'overview'
}

function scrollPageToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  document.querySelector<HTMLElement>('.main')?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

export function App() {
  const online = useNetworkStatus()
  const companionMode = useCompanionMode()
  const { persona, setPersona, allowedNav } = useConsolePersona()
  const [page, setPage] = useState<PageId>(initialPage)
  const [selected, setSelected] = useState<ActionResult | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const { held: heldConnectCount, refreshHeld } = useHeldCount(orgId)
  const [modalError, setModalError] = useState<string | null>(null)
  const [fleetStatus, setFleetStatus] = useState<FleetPauseStatus | null>(null)

  useEffect(() => {
    fetchMyOrgs().then((orgs) => { if (orgs[0]) setOrgId(orgs[0].org_id) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) return
    const poll = () => getFleetStatus(orgId).then(setFleetStatus).catch(() => {})
    void poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [orgId])
  const {
    audit,
    policies,
    status,
    setPolicy,
    replacePolicies,
    pendingVerification,
    pendingReviewCount,
    pendingReviewQueue,
    getQueuePosition,
    markVerificationsDismissed,
    openNextPendingReview,
    dismissCurrentAndAdvance,
    resolveVerificationEntry,
    showVerification,
    apiError,
    retryDelayMs,
    lastRefreshed,
    refresh,
  } = useDashboard()

  // Deep-link from push notification tap: open the verification modal for ?verify=<id>
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const verifyId = params.get('verify')
    if (!verifyId) return
    const match = audit.find((e) => e.id === verifyId && e.decision === 'REQUIRE_VERIFICATION')
    if (match) {
      showVerification(match)
      // Strip the param so refresh doesn't reopen it forever
      params.delete('verify')
      const qs = params.toString()
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    }
  }, [audit, showVerification])

  const { pendingCount: offlinePending, syncing: offlineSyncing } = useOfflineQueue(() => { void refresh() })

  const onSelect = (e: ActionResult) => setSelected(e)
  const onPage = useCallback((nextPage: PageId, query?: NavigateQuery) => {
    if (nextPage === page && !query) {
      scrollPageToTop()
      return
    }
    window.history.pushState(null, '', buildPageUrl(nextPage, query))
    setPage(nextPage)
    scrollPageToTop()
  }, [page])

  useEffect(() => {
    const onPopState = () => {
      setPage(initialPage())
      scrollPageToTop()
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Persona views hide nav sections — bounce disallowed deep links to a valid home.
  useEffect(() => {
    if (companionMode || !allowedNav) return
    if (allowedNav.includes(page)) return
    const fallback = allowedNav[0] ?? 'overview'
    window.history.replaceState(null, '', buildPageUrl(fallback))
    setPage(fallback)
    scrollPageToTop()
  }, [companionMode, allowedNav, page])

  return (
    <div className="shell">
      <Sidebar page={page} onPage={onPage} status={status} orgId={orgId} companionMode={companionMode} heldCount={heldConnectCount} persona={persona} setPersona={setPersona} />

      <MainCanvas>
        <PwaInstallBanner />
        {!online && (
          <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
            <div className="alert__body">
              <strong>You are offline.</strong> Dashboard data may be stale. Reconnect to resume live updates.
              {offlinePending > 0 && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>
                  {offlinePending} action{offlinePending > 1 ? 's' : ''} queued to sync.
                </span>
              )}
            </div>
          </div>
        )}
        {offlineSyncing && (
          <div className="alert alert--info" role="status" style={{ marginBottom: '1rem' }}>
            <div className="alert__body">Syncing offline changes…</div>
          </div>
        )}
        {apiError && (
          <PlanGateAlert message={apiError} style={{ marginBottom: '1rem' }} />
        )}

        {fleetStatus?.paused && (
          <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
            <div className="alert__body">
              <strong>Fleet paused</strong> — all agent action approvals are suspended org-wide.
              {fleetStatus.pausedBy && (
                <span style={{ marginLeft: '0.5rem', fontSize: '0.82rem' }}>
                  Paused by {fleetStatus.pausedBy}
                  {fleetStatus.pausedAt && ` · ${new Date(fleetStatus.pausedAt).toLocaleTimeString()}`}
                </span>
              )}
              {' '}Go to <button type="button" className="btn btn-ghost" style={{ padding: '0 0.25rem', fontSize: 'inherit', display: 'inline' }} onClick={() => onPage('fleet')}>Runtime Fleet</button> to resume.
            </div>
          </div>
        )}

        {!pendingVerification && pendingReviewCount > 0 && (
          <ReviewQueueBanner
            count={pendingReviewCount}
            summary={summarizePendingActions(pendingReviewQueue.map((e) => e.action))}
            onReviewNext={openNextPendingReview}
            onDismissAll={() => markVerificationsDismissed('all')}
            onViewActivity={() => onPage('activity')}
          />
        )}

        {page === 'overview' && (
          <ErrorBoundary page="Overview">
            <Overview
              sessionAudit={audit}
              policies={policies}
              status={status}
              onSelect={onSelect}
              lastRefreshed={lastRefreshed}
              companionMode={companionMode}
              pendingReviewCount={pendingReviewCount}
              onOpenReview={openNextPendingReview}
              orgId={orgId}
              onPage={onPage}
              persona={persona}
            />
          </ErrorBoundary>
        )}
        <Suspense fallback={<div className="page-loading" role="status">Loading view…</div>}>
          {page === 'activity' && <ErrorBoundary page="Runtime Activity"><RuntimeActivity orgId={orgId} onSelect={onSelect} onPage={onPage} /></ErrorBoundary>}
          {page === 'threats' && <ErrorBoundary page="Threat Monitor"><ThreatMonitor orgId={orgId} sessionAudit={audit} onSelect={onSelect} onPage={onPage} persona={persona} /></ErrorBoundary>}
          {page === 'shield' && <ErrorBoundary page="Sanctum Shield"><ShieldPage orgId={orgId} sessionAudit={audit} onPage={onPage} /></ErrorBoundary>}
          {page === 'shield-rules' && <ErrorBoundary page="Shield Rules"><ShieldRulesPage /></ErrorBoundary>}
          {page === 'agents' && <ErrorBoundary page="Agents"><Agents onOpenDevices={() => onPage('devices')} onPage={onPage} /></ErrorBoundary>}
          {page === 'alerts' && <ErrorBoundary page="Alerts"><Alerts onPage={onPage} /></ErrorBoundary>}
          {page === 'policies' && (
            <ErrorBoundary page="Policies">
              <Policies
                policies={policies}
                audit={audit}
                supabaseConfigured={status?.supabaseConfigured}
                onSetPolicy={setPolicy}
                onPoliciesChange={replacePolicies}
                onPage={onPage}
              />
            </ErrorBoundary>
          )}
          {page === 'policy-history' && <ErrorBoundary page="Policy History"><PolicyHistory onPage={onPage} /></ErrorBoundary>}
          {page === 'workflow-builder' && <ErrorBoundary page="Policy Composer"><WorkflowBuilder /></ErrorBoundary>}
          {page === 'assurance' && <ErrorBoundary page="Assurance"><Assurance onPage={onPage} persona={persona} /></ErrorBoundary>}
          {page === 'governance' && <ErrorBoundary page="Governance"><Governance onPage={onPage} /></ErrorBoundary>}
          {page === 'permissions' && <ErrorBoundary page="Permission graph"><Permissions onPage={onPage} /></ErrorBoundary>}
          {page === 'compliance' && <ErrorBoundary page="Compliance"><Compliance onPage={onPage} /></ErrorBoundary>}
          {page === 'devices' && <ErrorBoundary page="Devices"><Devices status={status} /></ErrorBoundary>}
          {page === 'fleet' && <ErrorBoundary page="Runtime Fleet"><Fleet onPage={onPage} /></ErrorBoundary>}
          {page === 'marketplace' && <ErrorBoundary page="Marketplace"><Marketplace /></ErrorBoundary>}
          {page === 'audit' && <ErrorBoundary page="Audit Logs"><AuditLogs orgId={orgId} onSelect={onSelect} onPage={onPage} /></ErrorBoundary>}
          {page === 'billing' && <ErrorBoundary page="Billing"><Billing /></ErrorBoundary>}
          {page === 'settings' && <ErrorBoundary page="Settings"><Settings status={status} /></ErrorBoundary>}
          {page === 'connect' && <ErrorBoundary page="Connect Agent"><Connect orgId={orgId} onPage={onPage} /></ErrorBoundary>}
          {page === 'live-feed' && <ErrorBoundary page="Live Feed"><LiveFeed orgId={orgId} onPage={onPage} onHeldChange={refreshHeld} /></ErrorBoundary>}
        </Suspense>
      </MainCanvas>

      <ActionDrawer
        entry={selected}
        onClose={() => setSelected(null)}
        audit={audit}
        onSelect={(e) => setSelected(e)}
        status={status}
      />

      {pendingVerification && (
        <>
          {modalError && (
            <div style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, minWidth: 320, maxWidth: 'min(92vw, 28rem)' }}>
              <PlanGateAlert message={modalError} onDismiss={() => setModalError(null)} />
            </div>
          )}
          <VerificationModal
            entry={pendingVerification}
            queuePosition={getQueuePosition(pendingVerification.id)}
            onApproveOnce={async (grantMinutes?: number) => {
              try {
                const entry = pendingVerification
                await resolveVerificationEntry(entry.id, 'APPROVED', grantMinutes)
                setSelected(entry)
                setModalError(null)
              } catch (e) {
                setModalError(formatApiError(e, 'Failed to approve'))
              }
            }}
            onAlwaysApprove={async () => {
              try {
                const entry = pendingVerification
                await setPolicy(entry.action, 'approve')
                await resolveVerificationEntry(entry.id, 'APPROVED')
                markVerificationsDismissed({ action: entry.action })
                setModalError(null)
              } catch (e) {
                setModalError(formatApiError(e, 'Failed to set policy'))
              }
            }}
            onDeny={async () => {
              try {
                await resolveVerificationEntry(pendingVerification.id, 'BLOCKED')
                setModalError(null)
              } catch (e) {
                setModalError(formatApiError(e, 'Failed to deny'))
              }
            }}
          />
        </>
      )}
    </div>
  )
}
