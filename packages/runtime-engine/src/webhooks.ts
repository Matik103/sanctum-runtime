import { createHmac } from 'node:crypto'
import type { ActionResult, Decision } from '@sanctum-runtime/sdk'

export type WebhookEvent =
  | 'verification.required'
  | 'action.blocked'
  | 'verification.resolved'

export type WebhookPayload = {
  event: WebhookEvent
  timestamp: string
  entry: ActionResult
}

export type WebhookConfig = {
  urls: string[]
  secret?: string
  events: Set<WebhookEvent>
}

const ALL_EVENTS: WebhookEvent[] = [
  'verification.required',
  'action.blocked',
  'verification.resolved',
]

export function loadWebhookConfig(): WebhookConfig | null {
  const rawUrls =
    process.env.SANCTUM_WEBHOOK_URLS?.trim() ||
    process.env.SANCTUM_WEBHOOK_URL?.trim() ||
    ''
  const urls = rawUrls
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
  if (!urls.length) return null

  const secret = process.env.SANCTUM_WEBHOOK_SECRET?.trim() || undefined
  const rawEvents = process.env.SANCTUM_WEBHOOK_EVENTS?.trim()
  const events = new Set<WebhookEvent>(
    rawEvents
      ? (rawEvents.split(',').map((e) => e.trim()) as WebhookEvent[])
      : ALL_EVENTS,
  )

  return { urls, secret, events }
}

export function webhookEventForDecision(
  decision: Decision,
  resolved: boolean,
): WebhookEvent | null {
  if (resolved) return 'verification.resolved'
  if (decision === 'REQUIRE_VERIFICATION') return 'verification.required'
  if (decision === 'BLOCKED') return 'action.blocked'
  return null
}

export async function dispatchWebhooks(
  event: WebhookEvent,
  entry: ActionResult,
): Promise<void> {
  const config = loadWebhookConfig()
  if (!config?.events.has(event)) return

  const body: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    entry,
  }
  const json = JSON.stringify(body)

  const { logWebhookDelivery } = await import('./supabase-webhooks.js')

  await Promise.all(
    config.urls.map(async (url) => {
      const started = Date.now()
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Sanctum-Event': event,
        }
        if (config.secret) {
          const sig = createHmac('sha256', config.secret).update(json).digest('hex')
          headers['X-Sanctum-Signature'] = `sha256=${sig}`
        }
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: json,
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          console.error(`[sanctum] webhook ${url} → ${res.status}`)
        }
        void logWebhookDelivery({
          event,
          targetUrl: url,
          statusCode: res.status,
          success: res.ok,
          payload: body,
          durationMs: Date.now() - started,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[sanctum] webhook ${url} failed: ${msg}`)
        void logWebhookDelivery({
          event,
          targetUrl: url,
          success: false,
          payload: body,
          errorMessage: msg,
          durationMs: Date.now() - started,
        })
      }
    }),
  )
}

export function getWebhookStatus(): {
  configured: boolean
  urlCount: number
  events: WebhookEvent[]
} {
  const config = loadWebhookConfig()
  return {
    configured: Boolean(config?.urls.length),
    urlCount: config?.urls.length ?? 0,
    events: config ? [...config.events] : [],
  }
}
