import { apiBaseUrl } from '../lib/api-url'
import { getAccessToken } from '../lib/supabase'

export type InboxSession = {
  id: string
  public_id: string
  status: 'queued' | 'human_active' | 'resolved' | 'bot'
  handoff_reason: string | null
  assigned_operator_email: string | null
  landing_path: string | null
  escalated_at: string | null
  last_message_at: string | null
  created_at: string
  preview?: string | null
}

export type InboxMessage = {
  id: string
  role: string
  content: string
  citations?: unknown[]
  sender?: string
  created_at: string
}

export type InboxAnalytics = {
  period_days: number
  sessions_started: number
  chats_completed: number
  handoffs: number
  handoff_rate: number
  avg_latency_ms: number | null
  feedback_up: number
  feedback_down: number
  queued: number
  human_active: number
  resolved: number
}

async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `request_failed_${res.status}`)
  return body
}

export async function fetchInboxSessions(): Promise<InboxSession[]> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/sessions`, {
    headers: await authHeaders(),
  })
  const data = await parse<{ sessions: InboxSession[] }>(res)
  return data.sessions
}

export async function fetchInboxSession(sessionId: string): Promise<{
  session: Record<string, unknown>
  messages: InboxMessage[]
}> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/sessions/${encodeURIComponent(sessionId)}`, {
    headers: await authHeaders(),
  })
  return parse(res)
}

export async function claimInboxSession(sessionId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/sessions/${encodeURIComponent(sessionId)}/claim`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: '{}',
  })
  await parse(res)
}

export async function replyInboxSession(sessionId: string, content: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/sessions/${encodeURIComponent(sessionId)}/reply`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: JSON.stringify({ content }),
  })
  await parse(res)
}

export async function resolveInboxSession(sessionId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/sessions/${encodeURIComponent(sessionId)}/resolve`, {
    method: 'POST',
    headers: await authHeaders(true),
    body: '{}',
  })
  await parse(res)
}

export async function fetchInboxAnalytics(days = 7): Promise<InboxAnalytics> {
  const res = await fetch(`${apiBaseUrl}/v1/support/inbox/analytics?days=${days}`, {
    headers: await authHeaders(),
  })
  const data = await parse<{ analytics: InboxAnalytics }>(res)
  return data.analytics
}

export function pollInboxSessions(
  onData: (sessions: InboxSession[]) => void,
  intervalMs = 3000,
): () => void {
  let cancelled = false
  const tick = () => {
    if (cancelled) return
    void fetchInboxSessions()
      .then(onData)
      .catch(() => {})
  }
  tick()
  const id = setInterval(tick, intervalMs)
  return () => {
    cancelled = true
    clearInterval(id)
  }
}
