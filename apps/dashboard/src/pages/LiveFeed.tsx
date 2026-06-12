import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, CheckSquare, Eye, ExternalLink, FileText, Radio, Settings, User, Wifi, WifiOff, X } from 'lucide-react'
import { useLiveFeed, type ProxyEvent } from '../hooks/useLiveFeed'
import { isAuditRealtimeEnabled } from '../hooks/useAuditEventsRealtime'
import { useLiveFeedPrefs } from '../hooks/useLiveFeedPrefs'
import { apiBaseUrl } from '../lib/api-url'
import { resolveVerification } from '../lib/api'
import { applyToolPolicy } from '../lib/connect-agent'
import { getAccessToken } from '../lib/supabase'
import { timeAgo } from '../lib/format'
import { decisionLabel } from '../lib/labels'
import { PlanGateAlert } from '../components/PlanGateAlert'
import { Alert } from '../components/ui/Alert'
import { formatApiError } from '../lib/sanitize-error'
import { readPageQuery } from '../lib/navigate'
import type { PageId } from '../layout/Sidebar'
import type { NavigateQuery } from '../lib/navigate'

const PLATFORM_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  azure: 'Azure OpenAI',
  bedrock: 'AWS Bedrock',
  grok: 'Grok',
  nvidia: 'NVIDIA NIM',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  kimi: 'Kimi',
  doubao: 'Doubao',
  gemini: 'Gemini',
}

const PLATFORM_FLAGS: Record<string, string> = {
  openai: '🤖',
  claude: '🧠',
  azure: '☁️',
  bedrock: '🟠',
  grok: '⚡',
  nvidia: '🟢',
  deepseek: '🐋',
  qwen: '☁️',
  kimi: '🌙',
  doubao: '🎵',
  gemini: '✨',
}

function DecisionBadge({ decision }: { decision: string }) {
  const tone =
    decision === 'APPROVED'
      ? { bg: 'rgba(34,197,94,0.15)', color: '#22c55e' }
      : decision === 'BLOCKED'
        ? { bg: 'rgba(248,113,113,0.15)', color: '#f87171' }
        : decision === 'REQUIRE_VERIFICATION'
          ? { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
          : { bg: 'var(--surface-2, #1a1a2e)', color: 'inherit' }
  const label =
    decision === 'APPROVED' || decision === 'BLOCKED' || decision === 'REQUIRE_VERIFICATION'
      ? decisionLabel(decision as 'APPROVED' | 'BLOCKED' | 'REQUIRE_VERIFICATION')
      : decision
  return (
    <span style={{
      fontSize: '0.65rem',
      fontWeight: 600,
      padding: '0.12rem 0.4rem',
      borderRadius: '0.25rem',
      background: tone.bg,
      color: tone.color,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  )
}

function ArgView({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span style={{ opacity: 0.4 }}>—</span>
  if (typeof value === 'string') {
    return <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', opacity: 0.85 }}>{value.slice(0, 120)}{value.length > 120 ? '…' : ''}</span>
  }
  let json: string
  try {
    json = JSON.stringify(value, null, 2)
  } catch {
    return <span style={{ opacity: 0.55, fontSize: '0.78rem' }}>[unserializable value]</span>
  }
  return (
    <pre className="live-feed-args" style={{ margin: 0, fontSize: '0.75rem', maxHeight: 120, overflowY: 'auto', background: 'var(--surface-2, #1a1a2e)', borderRadius: '0.3rem', padding: '0.4rem 0.6rem', border: '1px solid var(--border, #2a2a3e)' }}>
      {json.length > 400 ? json.slice(0, 400) + '\n…' : json}
    </pre>
  )
}

function blastDisplay(event: ProxyEvent): { level: string; score: number } | null {
  const br = event.blastRadius
  if (!br || typeof br !== 'object') return null
  const level = typeof br.level === 'string' ? br.level : undefined
  const score = typeof br.score === 'number' ? br.score : undefined
  if (!level && score == null) return null
  return { level: level ?? 'unknown', score: score ?? 0 }
}

function blastTone(level?: string) {
  if (level === 'critical' || level === 'high') return 'danger'
  if (level === 'medium') return 'warn'
  return 'neutral'
}

function readable(value?: string) {
  return value ? value.replace(/_/g, ' ') : 'unknown'
}

function EventRow({
  event,
  agentNames,
  orgId,
  onSelect,
  onResolve,
  onPolicy,
  onPage,
  resolving,
  policySaving,
  focused,
}: {
  event: ProxyEvent
  agentNames: Record<string, string>
  orgId?: string | null
  onSelect: (e: ProxyEvent) => void
  onResolve: (e: ProxyEvent, decision: 'APPROVED' | 'BLOCKED') => void
  onPolicy: (e: ProxyEvent, mode: 'verify' | 'block' | 'approve') => void
  onPage: (p: PageId, query?: NavigateQuery) => void
  resolving: string | null
  policySaving: string | null
  focused?: boolean
}) {
  const ctx = event.context ?? { proxy: true as const, platform: 'unknown', tool_call_id: '', arguments: undefined }
  const platform = ctx.platform ?? 'unknown'
  const agentId = ctx.agent_id ?? event.actor
  const agentLabel = ctx.agent_name ?? agentNames[agentId] ?? `${String(agentId).slice(0, 8)}…`
  const held = event.decision === 'REQUIRE_VERIFICATION'

  return (
    <div
      className={`live-feed-row${focused ? ' live-feed-row--focus' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(event) }}
      style={{ fontSize: '0.82rem', cursor: 'pointer' }}
    >
      <div className="live-feed-time" style={{ opacity: 0.55, fontSize: '0.75rem', paddingTop: '0.1rem' }}>
        {timeAgo(event.created_at)}
      </div>
      <div className="live-feed-agent" style={{ fontWeight: 500 }}>{agentLabel}</div>
      <div className="live-feed-platform" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', opacity: 0.85 }}>
        <span>{PLATFORM_FLAGS[platform] ?? '🔌'}</span>
        <span>{PLATFORM_LABELS[platform] ?? platform}</span>
      </div>
      <div className="live-feed-tool" style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <code style={{ fontWeight: 600, fontSize: '0.82rem' }}>{event.action}</code>
          <DecisionBadge decision={event.decision} />
          {event.sourceTrust && (
            <span className={`badge ${event.sourceTrust === 'untrusted_content' ? 'danger' : event.sourceTrust === 'tool_output' ? 'warn' : 'neutral'}`}>
              {readable(event.sourceTrust)}
            </span>
          )}
          {(() => {
            const blast = blastDisplay(event)
            if (!blast) return null
            return (
              <span className={`badge ${blastTone(blast.level)}`}>
                blast {blast.level} · {blast.score}/100
              </span>
            )
          })()}
        </div>
        <ArgView value={ctx.arguments} />
      </div>
      {(held || orgId) && (
        <div className="live-feed-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
          {held && (
            <div className="live-feed-decision-actions" style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={resolving === event.id} title="Approve" onClick={() => onResolve(event, 'APPROVED')}>
                <Check size={14} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={resolving === event.id} title="Deny" onClick={() => onResolve(event, 'BLOCKED')}>
                <X size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.62rem', padding: '0.08rem 0.35rem' }}
                title="Open governance workflow for this action"
                onClick={() => onPage('governance', {
                  focus_action: event.action,
                  correlation: event.correlation_id ?? event.id,
                })}
              >
                <CheckSquare size={11} />
              </button>
            </div>
          )}
          {orgId && (
            <>
              <div className="live-feed-policy-actions" style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }} disabled={policySaving === event.id} onClick={() => onPolicy(event, 'verify')}>Hold tool</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }} disabled={policySaving === event.id} onClick={() => onPolicy(event, 'block')}>Block</button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }} disabled={policySaving === event.id} onClick={() => onPolicy(event, 'approve')}>Auto-approve</button>
              </div>
              <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '0.08rem 0.3rem' }} title="View agent" onClick={() => onPage('agents')}>
                  <User size={11} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '0.08rem 0.3rem' }} title="Open audit" onClick={() => onPage('audit')}>
                  <FileText size={11} />
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: '0.62rem', padding: '0.08rem 0.3rem' }} title="Edit policies" onClick={() => onPage('policies')}>
                  <Settings size={11} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DetailDrawer({ event, onClose }: { event: ProxyEvent; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="card" style={{ width: 'min(420px, 100%)', height: '100%', borderRadius: 0, padding: '1.25rem', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Audit detail</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>
        <dl style={{ fontSize: '0.82rem', display: 'grid', gap: '0.65rem' }}>
          <div><dt style={{ opacity: 0.55 }}>Action</dt><dd><code>{event.action}</code></dd></div>
          <div><dt style={{ opacity: 0.55 }}>Decision</dt><dd><DecisionBadge decision={event.decision} /></dd></div>
          <div><dt style={{ opacity: 0.55 }}>Platform</dt><dd>{event.context?.platform ?? 'unknown'}</dd></div>
          <div><dt style={{ opacity: 0.55 }}>Agent</dt><dd>{event.context?.agent_name ?? event.actor}</dd></div>
          {event.correlation_id && <div><dt style={{ opacity: 0.55 }}>Correlation</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{event.correlation_id}</dd></div>}
          {event.reasoning && <div><dt style={{ opacity: 0.55 }}>Reasoning</dt><dd>{event.reasoning}</dd></div>}
          <div><dt style={{ opacity: 0.55 }}>Arguments</dt><dd><ArgView value={event.context?.arguments} /></dd></div>
          <div><dt style={{ opacity: 0.55 }}>When</dt><dd>{new Date(event.created_at).toLocaleString()}</dd></div>
        </dl>
      </div>
    </div>
  )
}

type Props = {
  orgId?: string | null
  onPage: (p: PageId, query?: NavigateQuery) => void
  onHeldChange?: () => void
}

export function LiveFeed({ orgId, onPage, onHeldChange }: Props) {
  const { prefs, setPrefs } = useLiveFeedPrefs(orgId)
  const { tab, platformFilter, agentFilter, toolFilter, decisionFilter } = prefs
  const [agentNames, setAgentNames] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<ProxyEvent | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)
  const [policySaving, setPolicySaving] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [policyMsg, setPolicyMsg] = useState<string | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [focusDismissed, setFocusDismissed] = useState(false)
  const realtime = isAuditRealtimeEnabled()

  const filters = useMemo(() => ({
    heldOnly: tab === 'held',
    platform: platformFilter || undefined,
    agentId: agentFilter || undefined,
    action: toolFilter || undefined,
    decision: decisionFilter || undefined,
  }), [tab, platformFilter, agentFilter, toolFilter, decisionFilter])

  const { events, connected, loading, heldCount, patchEvent } = useLiveFeed(orgId, filters)

  useEffect(() => {
    const params = readPageQuery()
    if (params.get('tab') === 'held') setPrefs({ tab: 'held' })
    const agentId = params.get('agent_id')
    if (agentId) setPrefs({ agentFilter: agentId })
    const focusEvent = params.get('focus_event')
    const correlation = params.get('correlation')
    const focusAction = params.get('focus_action')
    if (focusEvent) setFocusKey(focusEvent)
    else if (correlation) setFocusKey(correlation)
    else if (focusAction) setFocusKey(`action:${focusAction}`)
  }, [])

  function eventMatchesFocus(event: ProxyEvent): boolean {
    if (!focusKey) return false
    if (focusKey.startsWith('action:')) return event.action === focusKey.slice(7)
    return event.id === focusKey || event.correlation_id === focusKey
  }

  useEffect(() => {
    if (!focusKey || events.length === 0) return
    const match = events.find(eventMatchesFocus)
    if (match) {
      setSelected(match)
      requestAnimationFrame(() => {
        document.querySelector('.live-feed-row--focus')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
  }, [focusKey, events])

  async function handlePolicy(event: ProxyEvent, mode: 'verify' | 'block' | 'approve') {
    if (!orgId) return
    const targetOrg = event.org_id || orgId
    setPolicySaving(event.id)
    setPolicyMsg(null)
    try {
      await applyToolPolicy(targetOrg, event.action, mode)
      setPolicyMsg(`Policy for ${event.action}: ${mode}`)
    } catch (e) {
      setResolveError(formatApiError(e, 'Policy save failed'))
    } finally {
      setPolicySaving(null)
    }
  }

  async function handleResolve(event: ProxyEvent, decision: 'APPROVED' | 'BLOCKED') {
    setResolving(event.id)
    setResolveError(null)
    try {
      await resolveVerification(event.id, decision)
      patchEvent(event.id, { decision, reasoning: decision === 'APPROVED' ? 'Approved from Live Feed.' : 'Blocked from Live Feed.' })
      onHeldChange?.()
    } catch (e) {
      setResolveError(formatApiError(e, 'Resolve failed'))
    } finally {
      setResolving(null)
    }
  }

  useEffect(() => {
    if (!orgId) return
    void (async () => {
      const token = await getAccessToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${apiBaseUrl}/v1/orgs/${orgId}/agents`, { headers })
      if (!res.ok) return
      const list = (await res.json()) as Array<{ id: string; name: string }>
      setAgentNames(Object.fromEntries(list.map((a) => [a.id, a.name])))
    })()
  }, [orgId])

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Eye size={22} strokeWidth={1.75} />
            <h1 className="page-title" style={{ margin: 0 }}>Live Feed</h1>
            <span title={connected ? (realtime ? 'Realtime + 15s fallback poll' : 'Polling every ~2s') : 'Connecting…'} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', background: connected ? 'var(--success-muted, rgba(34,197,94,0.12))' : 'var(--surface-2, #1a1a2e)', color: connected ? 'var(--success, #22c55e)' : 'var(--muted, #888)' }}>
              {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
              {connected ? (realtime ? 'live · realtime' : 'live · 2s') : 'connecting'}
            </span>
            {heldCount > 0 && (
              <span className="badge warning" style={{ fontSize: '0.72rem' }}>
                <Bell size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {heldCount} held
              </span>
            )}
          </div>
          <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
            Connect Agent gates each tool call through Sanctum verify. Approve held actions inline — the proxy releases waiting requests automatically.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => onPage('connect')} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}>
          <Radio size={14} />
          Connect an agent
        </button>
      </div>

      {focusKey && !focusDismissed && (
        <Alert variant="info" onDismiss={() => setFocusDismissed(true)} style={{ marginBottom: '0.75rem' }}>
          Highlighting event from Governance{focusKey.startsWith('action:') ? ` matching ${focusKey.slice(7)}` : ''}.
        </Alert>
      )}

      <div className="live-feed-toolbar card" style={{ padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
        <div className="live-feed-tabs" style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
          {(['all', 'held'] as const).map((t) => (
            <button key={t} type="button" className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPrefs({ tab: t })}>
              {t === 'all' ? 'All events' : `Held queue${heldCount ? ` (${heldCount})` : ''}`}
            </button>
          ))}
        </div>
        <div className="live-feed-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem' }}>
          <select className="input" value={platformFilter} onChange={(e) => setPrefs({ platformFilter: e.target.value })} aria-label="Filter platform">
            <option value="">All platforms</option>
            {Object.entries(PLATFORM_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          <select className="input" value={agentFilter} onChange={(e) => setPrefs({ agentFilter: e.target.value })} aria-label="Filter agent">
            <option value="">All agents</option>
            {Object.entries(agentNames).map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select className="input" value={decisionFilter} onChange={(e) => setPrefs({ decisionFilter: e.target.value })} aria-label="Filter decision">
            <option value="">All decisions</option>
            <option value="APPROVED">Approved</option>
            <option value="REQUIRE_VERIFICATION">Held</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <input className="input" placeholder="Filter tool name…" value={toolFilter} onChange={(e) => setPrefs({ toolFilter: e.target.value })} aria-label="Filter tool" />
        </div>
      </div>

      {policyMsg && (
        <div className="alert alert--info" style={{ marginBottom: '0.75rem' }}><div className="alert__body">{policyMsg}</div></div>
      )}
      {resolveError && (
        <PlanGateAlert message={resolveError} onDismiss={() => setResolveError(null)} style={{ marginBottom: '0.75rem' }} />
      )}

      <div className="card live-feed-card">
        <div className="live-feed-header" style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.5 }}>
          <span>When</span><span>Sanctum agent</span><span>Platform</span><span>Tool call</span>
        </div>
        {loading && <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5, fontSize: '0.85rem' }}>Loading…</div>}
        {!loading && events.length === 0 && (
          <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <Eye size={32} strokeWidth={1.25} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{tab === 'held' ? 'No held actions' : 'No tool calls yet'}</p>
            <p style={{ fontSize: '0.83rem', opacity: 0.55, marginBottom: '1rem' }}>
              {tab === 'held' ? 'When a tool call requires approval it appears here instantly.' : 'Once your agent makes a tool call through the proxy, it will appear here within ~2 seconds.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => onPage('connect')}>Connect your agent</button>
          </div>
        )}
        {!loading && events.map((e) => (
          <EventRow
            key={e.id}
            event={e}
            agentNames={agentNames}
            orgId={orgId}
            onSelect={setSelected}
            onResolve={(ev, d) => void handleResolve(ev, d)}
            onPolicy={(ev, m) => void handlePolicy(ev, m)}
            onPage={onPage}
            resolving={resolving}
            policySaving={policySaving}
            focused={eventMatchesFocus(e)}
          />
        ))}
      </div>

      {selected && <DetailDrawer event={selected} onClose={() => setSelected(null)} />}

      {events.length > 0 && (
        <p style={{ fontSize: '0.75rem', opacity: 0.4, marginTop: '0.5rem', textAlign: 'right' }}>
          Showing {events.length} tool call{events.length === 1 ? '' : 's'} · {realtime ? 'Realtime + 15s fallback' : 'Updates every ~2s'}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: '0.5rem' }} onClick={() => onPage('audit')}>
            <ExternalLink size={12} /> Full audit
          </button>
        </p>
      )}
    </div>
  )
}
