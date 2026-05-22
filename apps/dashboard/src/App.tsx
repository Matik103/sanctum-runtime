import { useState, useEffect } from 'react'
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
import { getFleetStatus, type FleetPauseStatus } from './lib/api'
import { Assurance } from './pages/Assurance'
import { AuditLogs } from './pages/AuditLogs'
import { Billing } from './pages/Billing'
import { Compliance } from './pages/Compliance'
import { Devices } from './pages/Devices'
import { Fleet } from './pages/Fleet'
import { Governance } from './pages/Governance'
import { Marketplace } from './pages/Marketplace'
import { Overview } from './pages/Overview'
import { Policies } from './pages/Policies'
import { PolicyHistory } from './pages/PolicyHistory'
import { RuntimeActivity } from './pages/RuntimeActivity'
import { Settings } from './pages/Settings'
import { ThreatMonitor } from './pages/ThreatMonitor'
import { WorkflowBuilder } from './pages/WorkflowBuilder'
import { Agents } from './pages/Agents'
import { Alerts } from './pages/Alerts'
import { fetchMyOrgs } from './lib/fleet'
import { useOfflineQueue } from './hooks/useOfflineQueue'

export function App() {
  const online = useNetworkStatus()
  const companionMode = useCompanionMode()
  const [page, setPage] = useState<PageId>('overview')
  const [selected, setSelected] = useState<ActionResult | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
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
    apiError,
    retryDelayMs,
    lastRefreshed,
    refresh,
  } = useDashboard()

  const { pendingCount: offlinePending, syncing: offlineSyncing } = useOfflineQueue(() => { void refresh() })

  const onSelect = (e: ActionResult) => setSelected(e)

  return (
    <div className="shell">
      <Sidebar page={page} onPage={setPage} status={status} orgId={orgId} companionMode={companionMode} />

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
          <div className="alert alert--error" role="alert">
            <div className="alert__body">
              <strong>API unreachable</strong>
              <p style={{ margin: '0.5rem 0 0' }}>{apiError}</p>
              {retryDelayMs !== null && (
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', opacity: 0.65 }}>
                  Retrying in ~{retryDelayMs >= 60_000
                    ? `${Math.round(retryDelayMs / 60_000)}m`
                    : `${Math.round(retryDelayMs / 1000)}s`}
                </p>
              )}
            </div>
          </div>
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
              {' '}Go to <button type="button" className="btn btn-ghost" style={{ padding: '0 0.25rem', fontSize: 'inherit', display: 'inline' }} onClick={() => setPage('fleet')}>Runtime Fleet</button> to resume.
            </div>
          </div>
        )}

        {!pendingVerification && pendingReviewCount > 0 && (
          <ReviewQueueBanner
            count={pendingReviewCount}
            summary={summarizePendingActions(pendingReviewQueue.map((e) => e.action))}
            onReviewNext={openNextPendingReview}
            onDismissAll={() => markVerificationsDismissed('all')}
            onViewActivity={() => setPage('activity')}
          />
        )}

        {page === 'overview' && (
          <ErrorBoundary page="Overview">
            <Overview
              audit={audit}
              policies={policies}
              status={status}
              onSelect={onSelect}
              lastRefreshed={lastRefreshed}
              companionMode={companionMode}
              pendingReviewCount={pendingReviewCount}
              onOpenReview={openNextPendingReview}
              orgId={orgId}
            />
          </ErrorBoundary>
        )}
        {page === 'activity' && <ErrorBoundary page="Runtime Activity"><RuntimeActivity audit={audit} onSelect={onSelect} /></ErrorBoundary>}
        {page === 'threats' && <ErrorBoundary page="Threat Monitor"><ThreatMonitor audit={audit} onSelect={onSelect} /></ErrorBoundary>}
        {page === 'agents' && <ErrorBoundary page="Agents"><Agents /></ErrorBoundary>}
        {page === 'alerts' && <ErrorBoundary page="Alerts"><Alerts /></ErrorBoundary>}
        {page === 'policies' && (
          <ErrorBoundary page="Policies">
            <Policies
              policies={policies}
              audit={audit}
              supabaseConfigured={status?.supabaseConfigured}
              onSetPolicy={setPolicy}
              onPoliciesChange={replacePolicies}
            />
          </ErrorBoundary>
        )}
        {page === 'policy-history' && <ErrorBoundary page="Policy History"><PolicyHistory /></ErrorBoundary>}
        {page === 'workflow-builder' && <ErrorBoundary page="Workflow Builder"><WorkflowBuilder /></ErrorBoundary>}
        {page === 'assurance' && <ErrorBoundary page="Assurance"><Assurance /></ErrorBoundary>}
        {page === 'governance' && <ErrorBoundary page="Governance"><Governance /></ErrorBoundary>}
        {page === 'compliance' && <ErrorBoundary page="Compliance"><Compliance /></ErrorBoundary>}
        {page === 'devices' && <ErrorBoundary page="Devices"><Devices status={status} /></ErrorBoundary>}
        {page === 'fleet' && <ErrorBoundary page="Runtime Fleet"><Fleet /></ErrorBoundary>}
        {page === 'marketplace' && <ErrorBoundary page="Marketplace"><Marketplace /></ErrorBoundary>}
        {page === 'audit' && <ErrorBoundary page="Audit Logs"><AuditLogs audit={audit} onSelect={onSelect} /></ErrorBoundary>}
        {page === 'billing' && <ErrorBoundary page="Billing"><Billing /></ErrorBoundary>}
        {page === 'settings' && <ErrorBoundary page="Settings"><Settings status={status} /></ErrorBoundary>}
      </MainCanvas>

      <ActionDrawer
        entry={selected}
        onClose={() => setSelected(null)}
        audit={audit}
        onSelect={(e) => setSelected(e)}
      />

      {pendingVerification && (
        <>
          {modalError && (
            <div className="alert alert--error" role="alert" style={{ position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, minWidth: 320 }}>
              <div className="alert__body">
                <strong>Action failed</strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{modalError}</p>
              </div>
              <button type="button" onClick={() => setModalError(null)} style={{ marginLeft: '1rem', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
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
                setModalError(e instanceof Error ? e.message : 'Failed to approve')
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
                setModalError(e instanceof Error ? e.message : 'Failed to set policy')
              }
            }}
            onDeny={async () => {
              try {
                await resolveVerificationEntry(pendingVerification.id, 'BLOCKED')
                setModalError(null)
              } catch (e) {
                setModalError(e instanceof Error ? e.message : 'Failed to deny')
              }
            }}
          />
        </>
      )}
    </div>
  )
}
