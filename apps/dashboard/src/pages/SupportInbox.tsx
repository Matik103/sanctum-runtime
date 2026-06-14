import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Inbox, RefreshCw, Send, UserRoundCheck } from 'lucide-react'
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

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  human_active: 'Live',
  resolved: 'Resolved',
  bot: 'Bot',
}

export function SupportInbox() {
  const [sessions, setSessions] = useState<InboxSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [sessionMeta, setSessionMeta] = useState<Record<string, unknown> | null>(null)
  const [reply, setReply] = useState('')
  const [analytics, setAnalytics] = useState<InboxAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

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
    setLoading(true)
    void fetchInboxAnalytics(7)
      .then(setAnalytics)
      .catch((e) => {
        if (String(e).includes('support_inbox_forbidden')) setForbidden(true)
      })
      .finally(() => setLoading(false))

    const stop = pollInboxSessions((list) => {
      setSessions(list)
      if (!selectedId && list[0]) setSelectedId(list[0].public_id)
    }, 3000)

    return stop
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    void loadDetail(selectedId)
    const id = setInterval(() => void loadDetail(selectedId), 4000)
    return () => clearInterval(id)
  }, [selectedId, loadDetail])

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
      <div className="page">
        <Alert variant="warning" title="Support inbox access required">
          Add your email to <code>SUPPORT_INBOX_ALLOWED_EMAILS</code> or{' '}
          <code>support_agent_config.inbox.allowed_emails</code> to use the human inbox.
        </Alert>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <Inbox size={22} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
            Support Inbox
          </h1>
          <p className="page-subtitle">Human takeover for marketing-site Sanctum Guide chats</p>
        </div>
      </header>

      {analytics ? (
        <div className="stat-grid" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12 }}>
          {[
            { label: 'Chats (7d)', value: analytics.chats_completed },
            { label: 'Handoffs', value: analytics.handoffs },
            { label: 'Handoff %', value: `${analytics.handoff_rate}%` },
            { label: 'Avg latency', value: analytics.avg_latency_ms ? `${analytics.avg_latency_ms}ms` : '—' },
            { label: '👍', value: analytics.feedback_up },
            { label: '👎', value: analytics.feedback_down },
            { label: 'Queued', value: analytics.queued },
            { label: 'Live', value: analytics.human_active },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <Alert variant="error" title={error} /> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,320px) 1fr', gap: 16, minHeight: 480 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>
            Waiting &amp; active ({sessions.length})
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {loading && !sessions.length ? (
              <p style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Loading…</p>
            ) : null}
            {!sessions.length && !loading ? (
              <p style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No escalated chats right now.</p>
            ) : null}
            {sessions.map((s) => (
              <button
                key={s.public_id}
                type="button"
                onClick={() => setSelectedId(s.public_id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '12px 14px',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  background: selectedId === s.public_id ? 'var(--accent)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  <span style={{ color: 'var(--muted)' }}>{timeAgo(s.last_message_at ?? s.created_at)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {s.handoff_reason ?? 'handoff'} · {s.landing_path ?? '/'}
                </div>
                {s.preview ? (
                  <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.preview}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 480 }}>
          {!selectedId ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              Select a conversation
            </div>
          ) : (
            <>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <code style={{ fontSize: 11 }}>{selectedId}</code>
                {sessionMeta?.assigned_operator_email ? (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <UserRoundCheck size={12} style={{ display: 'inline' }} /> {String(sessionMeta.assigned_operator_email)}
                  </span>
                ) : null}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void handleClaim()}>
                    Claim
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadDetail(selectedId)}>
                    <RefreshCw size={14} />
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleResolve()}>
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                {detailLoading && !messages.length ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading transcript…</p>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: m.role === 'user' ? 'var(--primary)' : 'var(--elevated)',
                        color: m.role === 'user' ? 'var(--primary-foreground)' : 'inherit',
                        fontSize: 13,
                        lineHeight: 1.5,
                      }}
                    >
                      {m.sender === 'operator' ? (
                        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, opacity: 0.8 }}>OPERATOR</div>
                      ) : null}
                      {m.content}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder="Reply as Sanctum team…"
                  style={{ flex: 1, resize: 'none', fontSize: 13 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                />
                <button type="button" className="btn btn-primary" disabled={sending || !reply.trim()} onClick={() => void handleSend()}>
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
