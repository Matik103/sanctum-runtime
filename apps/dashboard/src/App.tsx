import { useState } from 'react'
import type { ActionResult } from '@sanctum-runtime/sdk/browser'
import { ActionDrawer } from './components/ActionDrawer'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useNetworkStatus } from './hooks/useNetworkStatus'
import { ReviewQueueBanner, summarizePendingActions } from './components/ReviewQueueBanner'
import { VerificationModal } from './components/VerificationModal'
import { useDashboard } from './hooks/useDashboard'
import { MainCanvas } from './layout/MainCanvas'
import { Sidebar, type PageId } from './layout/Sidebar'
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
import { Agents } from './pages/Agents'
import { Alerts } from './pages/Alerts'
import { LegalFooter } from './components/LegalFooter'

export function App() {
  const online = useNetworkStatus()
  const [page, setPage] = useState<PageId>('overview')
  const [selected, setSelected] = useState<ActionResult | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
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
    lastRefreshed,
  } = useDashboard()

  const onSelect = (e: ActionResult) => setSelected(e)

  return (
    <div className="shell">
      <Sidebar page={page} onPage={setPage} status={status} />

      <MainCanvas>
        <ErrorBoundary>
        {!online && (
          <div className="alert alert--warn" role="alert" style={{ marginBottom: '1rem' }}>
            <div className="alert__body">
              <strong>You are offline.</strong> Dashboard data may be stale. Reconnect to resume live updates.
            </div>
          </div>
        )}
        {apiError && (
          <div className="alert alert--error" role="alert">
            <div className="alert__body">
              <strong>API unreachable</strong>
              <p style={{ margin: '0.5rem 0 0' }}>{apiError}</p>
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
          <Overview
            audit={audit}
            policies={policies}
            status={status}
            onSelect={onSelect}
            lastRefreshed={lastRefreshed}
          />
        )}
        {page === 'activity' && <RuntimeActivity audit={audit} onSelect={onSelect} />}
        {page === 'threats' && <ThreatMonitor audit={audit} onSelect={onSelect} />}
        {page === 'agents' && <Agents />}
        {page === 'alerts' && <Alerts onPage={setPage} />}
        {page === 'policies' && (
          <Policies
            policies={policies}
            audit={audit}
            supabaseConfigured={status?.supabaseConfigured}
            onSetPolicy={setPolicy}
            onPoliciesChange={replacePolicies}
          />
        )}
        {page === 'policy-history' && <PolicyHistory />}
        {page === 'governance' && <Governance />}
        {page === 'compliance' && <Compliance />}
        {page === 'devices' && <Devices status={status} />}
        {page === 'fleet' && <Fleet />}
        {page === 'marketplace' && <Marketplace />}
        {page === 'audit' && <AuditLogs audit={audit} onSelect={onSelect} />}
        {page === 'billing' && <Billing />}
        {page === 'settings' && <Settings status={status} />}
        </ErrorBoundary>
        <LegalFooter className="legal-footer--shell" />
      </MainCanvas>

      <ActionDrawer entry={selected} onClose={() => setSelected(null)} />

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
