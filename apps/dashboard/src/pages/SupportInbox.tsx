import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  MessageSquare,
  RefreshCw,
  Send,
  UserRoundCheck,
} from 'lucide-react'
import { Alert } from '../components/ui/Alert'
import { timeAgo } from '../lib/format'
import { formatApiError } from '../lib/sanitize-error'
import {
  claimInboxSession,
  fetchInboxAnalytics,
  fetchInboxSession,
  pollInboxSessions,
  replyInboxSession,
  resolveInboxSession,
  type InboxAnalytics,
  type InboxMessage,
  type InboxSession,
} from '../lib/support-inbox-api'
import { useSupportPortalAuth } from '../auth/SupportPortalAuthProvider'
import { useInboxLayout } from '../hooks/useInboxLayout'

const STATUS_LABEL: Record<string, string> = {
  queued: 'Awaiting specialist',
  human_active: 'Live',
  resolved: 'Resolved',
  bot: 'Guide',
}

const BADGE_CLASS: Record<string, string> = {
  queued: 'support-inbox__badge--queued',
  human_active: 'support-inbox__badge--live',
  resolved: 'support-inbox__badge--resolved',
}

type TranscriptItem =
  | { kind: 'divider'; id: string; label: string }
  | { kind: 'message'; id: string; message: InboxMessage }

function messageKind(m: InboxMessage): 'visitor' | 'guide' | 'operator' | 'system' {
  if (m.role === 'user') return 'visitor'
  if (m.sender === 'operator') return 'operator'
  if (m.sender === 'system') return 'system'
  return 'guide'
}

function buildTranscript(messages: InboxMessage[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let handoffMarked = false

  for (const m of messages) {
    const kind = messageKind(m)
    if (!handoffMarked && (kind === 'operator' || kind === 'system')) {
      items.push({ kind: 'divider', id: `handoff-${m.id}`, label: 'Sanctum Support · live' })
      handoffMarked = true
    }
    items.push({ kind: 'message', id: m.id, message: m })
  }

  return items
}

function syncSessionUrl(publicId: string | null) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('page', 'support-inbox')
  if (publicId) url.searchParams.set('session', publicId)
  else url.searchParams.delete('session')
  window.history.replaceState(null, '', `${url.pathname}${url.search}`)
}

export function SupportInbox({
  initialSessionId = null,
  portalMode = false,
}: {
  initialSessionId?: string | null
  portalMode?: boolean
}) {
  const { user } = useSupportPortalAuth()
  const { isNarrow } = useInboxLayout()
  const operatorName =
    (typeof user?.user_metadata?.display_name === 'string' && user.user_metadata.display_name.trim()) ||
    'Alex Rivera'

  const [sessions, setSessions] = useState<InboxSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [sessionMeta, setSessionMeta] = useState<Record<string, unknown> | null>(null)
  const [reply, setReply] = useState('')
  const [analytics, setAnalytics] = useState<InboxAnalytics | null>(null)
  const [statsOpen, setStatsOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const messageCountRef = useRef(0)

  const selectedSession = useMemo(
    () => sessions.find((s) => s.public_id === selectedId) ?? null,
    [sessions, selectedId],
  )

  const transcript = useMemo(() => buildTranscript(messages), [messages])
  const sessionStatus = (sessionMeta?.status as string | undefined) ?? selectedSession?.status

  const selectSession = useCallback((publicId: string) => {
    setSelectedId(publicId)
    if (portalMode) syncSessionUrl(publicId)
  }, [portalMode])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    if (portalMode) syncSessionUrl(null)
  }, [portalMode])

  const loadDetail = useCallback(async (publicId: string) => {
    setDetailLoading(true)
    setError(null)
    try {
      const data = await fetchInboxSession(publicId)
      setSessionMeta(data.session)
      setMessages(data.messages)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialSessionId) setSelectedId(initialSessionId)
  }, [initialSessionId])

  useEffect(() => {
    setLoading(true)
    void fetchInboxAnalytics(7)
      .then(setAnalytics)
      .catch((e) => {
        if (String(e).includes('support_inbox_forbidden')) setForbidden(true)
      })
      .finally(() => setLoading(false))

    const stop = pollInboxSessions((list) => {
      setSessions(list)
      setSelectedId((current) => {
        if (current) return current
        if (initialSessionId && list.some((s) => s.public_id === initialSessionId)) {
          return initialSessionId
        }
        return list[0]?.public_id ?? null
      })
    }, 3000)

    return stop
  }, [initialSessionId])

  useEffect(() => {
    if (!selectedId) return
    void loadDetail(selectedId)
    const id = setInterval(() => void loadDetail(selectedId), 4000)
    return () => clearInterval(id)
  }, [selectedId, loadDetail])

  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      const el = transcriptRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
    messageCountRef.current = messages.length
  }, [messages])

  const handleClaim = async () => {
    if (!selectedId) return
    try {
      await claimInboxSession(selectedId)
      await loadDetail(selectedId)
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  const handleSend = async () => {
    if (!selectedId || !reply.trim() || sending) return
    setSending(true)
    try {
      if (sessionStatus === 'queued') await claimInboxSession(selectedId).catch(() => {})
      await replyInboxSession(selectedId, reply.trim())
      setReply('')
      await loadDetail(selectedId)
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSending(false)
    }
  }

  const handleResolve = async () => {
    if (!selectedId) return
    try {
      await resolveInboxSession(selectedId)
      await loadDetail(selectedId)
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  if (forbidden) {
    return (
      <div className={portalMode ? 'support-portal-inbox page' : 'page'} style={{ padding: 16 }}>
        <Alert variant="warning" title="Support inbox access required">
          Your account is not on the support operator allowlist. Ask an admin to add{' '}
          <code>SUPPORT_INBOX_ALLOWED_EMAILS</code> or update{' '}
          <code>support_agent_config.inbox.allowed_emails</code>.
        </Alert>
      </div>
    )
  }

  const showQueue = !isNarrow || !selectedId
  const showThread = !isNarrow || Boolean(selectedId)

  return (
    <div className={portalMode ? 'support-portal-inbox page' : 'page'}>
      <div className="support-inbox">
        {analytics ? (
          <section className="support-inbox__stats">
            <button
              type="button"
              className="support-inbox__stats-toggle"
              aria-expanded={statsOpen}
              onClick={() => setStatsOpen((v) => !v)}
            >
              <span>Last 7 days</span>
              <span>{statsOpen ? 'Hide' : 'Show'} metrics</span>
            </button>
            <div
              className="support-inbox__stats-grid"
              hidden={isNarrow && !statsOpen}
            >
              {[
                { label: 'Chats', value: analytics.chats_completed },
                { label: 'Handoffs', value: analytics.handoffs },
                { label: 'Handoff %', value: `${analytics.handoff_rate}%` },
                { label: 'Latency', value: analytics.avg_latency_ms ? `${analytics.avg_latency_ms}ms` : '—' },
                { label: 'Thumbs up', value: analytics.feedback_up },
                { label: 'Thumbs down', value: analytics.feedback_down },
                { label: 'Queued', value: analytics.queued },
                { label: 'Live', value: analytics.human_active },
              ].map((s) => (
                <div key={s.label} className="support-inbox__stat">
                  <div className="support-inbox__stat-label">{s.label}</div>
                  <div className="support-inbox__stat-value">{s.value}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="support-inbox__alert">
            <Alert variant="error" title={error} />
          </div>
        ) : null}

        <div className="support-inbox__workspace">
          <aside
            className={`support-inbox__queue${showQueue ? '' : ' support-inbox__queue--hidden'}`}
            aria-label="Conversation queue"
          >
            <div className="support-inbox__queue-head">
              <span>
                <Inbox size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
                Inbox
              </span>
              <span className="support-inbox__queue-count">{sessions.length}</span>
            </div>
            <div className="support-inbox__queue-list">
              {loading && !sessions.length ? (
                <p className="support-inbox__queue-empty">Loading conversations…</p>
              ) : null}
              {!sessions.length && !loading ? (
                <p className="support-inbox__queue-empty">
                  No live conversations right now.
                  <br />
                  Visitors appear here when they ask for a specialist on the marketing site.
                </p>
              ) : null}
              {sessions.map((s) => (
                <button
                  key={s.public_id}
                  type="button"
                  className={`support-inbox__queue-item${selectedId === s.public_id ? ' support-inbox__queue-item--active' : ''}`}
                  onClick={() => selectSession(s.public_id)}
                >
                  <div className="support-inbox__queue-item-top">
                    <span className={`support-inbox__badge ${BADGE_CLASS[s.status] ?? ''}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <span className="support-inbox__queue-time">
                      {timeAgo(s.last_message_at ?? s.created_at)}
                    </span>
                  </div>
                  <div className="support-inbox__queue-meta">
                    {s.handoff_reason ?? 'handoff'} · {s.landing_path ?? '/'}
                  </div>
                  {s.preview ? (
                    <div className="support-inbox__queue-preview">{s.preview}</div>
                  ) : null}
                </button>
              ))}
            </div>
          </aside>

          <section
            className={`support-inbox__thread${showThread ? '' : ' support-inbox__thread--hidden'}`}
            aria-label="Conversation"
          >
            {!selectedId ? (
              <div className="support-inbox__thread-empty">
                <MessageSquare size={28} style={{ opacity: 0.35 }} />
                <p className="support-inbox__thread-empty-title">Select a conversation</p>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Pick a conversation to read the Guide transcript and continue as {operatorName}.
                </p>
              </div>
            ) : (
              <>
                <header className="support-inbox__thread-head">
                  {isNarrow ? (
                    <button
                      type="button"
                      className="support-inbox__back"
                      aria-label="Back to inbox"
                      onClick={clearSelection}
                    >
                      <ArrowLeft size={16} />
                    </button>
                  ) : null}
                  <div className="support-inbox__thread-title">
                    <h2>
                      {STATUS_LABEL[sessionStatus ?? ''] ?? 'Conversation'}
                      {selectedSession?.handoff_reason ? ` · ${selectedSession.handoff_reason}` : ''}
                    </h2>
                    <p>
                      {selectedSession?.landing_path ?? '/'}
                      {sessionMeta?.assigned_operator_email ? (
                        <>
                          {' '}
                          · <UserRoundCheck size={11} style={{ display: 'inline' }} />{' '}
                          {String(sessionMeta.assigned_operator_email)}
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="support-inbox__thread-actions">
                    {sessionStatus === 'queued' ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleClaim()}>
                        <UserRoundCheck size={14} />
                        <span>Claim</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label="Refresh"
                      onClick={() => void loadDetail(selectedId)}
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleResolve()}>
                      <CheckCircle2 size={14} />
                      <span>Resolve</span>
                    </button>
                  </div>
                </header>

                <div ref={transcriptRef} className="support-inbox__transcript">
                  {detailLoading && !messages.length ? (
                    <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading transcript…</p>
                  ) : null}
                  {transcript.map((item) => {
                    if (item.kind === 'divider') {
                      return (
                        <div key={item.id} className="support-inbox__divider" role="separator">
                          {item.label}
                        </div>
                      )
                    }

                    const m = item.message
                    const kind = messageKind(m)

                    if (kind === 'system') {
                      return (
                        <div key={item.id} className="support-inbox__bubble support-inbox__bubble--system">
                          {m.content}
                        </div>
                      )
                    }

                    const label =
                      kind === 'operator'
                        ? m.operator_display_name ?? operatorName
                        : kind === 'guide'
                          ? 'Sanctum Guide'
                          : null

                    return (
                      <div
                        key={item.id}
                        className={`support-inbox__bubble support-inbox__bubble--${kind}`}
                      >
                        {label ? (
                          <div
                            className={`support-inbox__bubble-label support-inbox__bubble-label--${kind === 'operator' ? 'operator' : 'guide'}`}
                          >
                            {label}
                          </div>
                        ) : null}
                        {m.content}
                      </div>
                    )
                  })}
                </div>

                <div className="support-inbox__compose">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    placeholder={
                      sessionStatus === 'queued'
                        ? `Introduce yourself and reply as ${operatorName}…`
                        : `Reply as ${operatorName}…`
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={sending || !reply.trim()}
                    aria-label="Send reply"
                    onClick={() => void handleSend()}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
