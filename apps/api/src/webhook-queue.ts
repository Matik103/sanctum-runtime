import { createHmac } from 'node:crypto'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type WebhookQueueEntry = {
  id: string
  org_id: string
  event_type: string
  payload: unknown
  url: string
  attempts: number
  next_retry_at: string   // ISO timestamp
  last_error: string | null
  delivered_at: string | null
}

/**
 * Inserts a new webhook delivery job into the queue.
 */
export async function enqueueWebhook(
  cfg: SupabaseAuthConfig,
  entry: Omit<WebhookQueueEntry, 'id' | 'attempts' | 'next_retry_at' | 'delivered_at'>,
): Promise<void> {
  const admin = createSupabaseAdmin(cfg)
  await admin.from('webhook_queue').insert({
    org_id: entry.org_id,
    event_type: entry.event_type,
    payload: entry.payload,
    url: entry.url,
    last_error: entry.last_error ?? null,
    attempts: 0,
    next_retry_at: new Date().toISOString(),
    delivered_at: null,
  })
}

/**
 * Delivers a single webhook to `url` with the given payload.
 * Optionally signs the request body with HMAC-SHA256 in the `X-Sanctum-Signature` header.
 * Enforces a 10-second timeout.
 */
export async function deliverWebhook(
  url: string,
  payload: unknown,
  secret?: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Sanctum-Webhook/1.0',
  }

  if (secret) {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    headers['X-Sanctum-Signature'] = `sha256=${sig}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      }
    }

    return { ok: true, status: res.status }
  } catch (err) {
    clearTimeout(timer)
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, error: message }
  }
}

const MAX_ATTEMPTS = 5

/**
 * Calculates the next retry delay using exponential backoff.
 * Delay = 2^attempts * 30 seconds (30s, 60s, 120s, 240s, 480s …)
 */
function nextRetryAt(attempts: number): string {
  const delayMs = Math.pow(2, attempts) * 30_000
  return new Date(Date.now() + delayMs).toISOString()
}

/**
 * Fetches up to 50 pending entries due for delivery, attempts each, and
 * updates the database with the result.
 *
 * Returns a summary of how many were processed and how many failed.
 */
export async function processWebhookQueue(
  cfg: SupabaseAuthConfig,
): Promise<{ processed: number; failed: number }> {
  const admin = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()

  const { data: entries, error } = await admin
    .from('webhook_queue')
    .select('*')
    .is('delivered_at', null)
    .lte('next_retry_at', now)
    .lt('attempts', MAX_ATTEMPTS)
    .order('next_retry_at', { ascending: true })
    .limit(50)

  if (error || !entries || entries.length === 0) {
    return { processed: 0, failed: 0 }
  }

  let processed = 0
  let failed = 0

  for (const entry of entries as WebhookQueueEntry[]) {
    const result = await deliverWebhook(entry.url, entry.payload)
    const newAttempts = entry.attempts + 1

    if (result.ok) {
      await admin
        .from('webhook_queue')
        .update({
          attempts: newAttempts,
          delivered_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', entry.id)
      processed++
    } else {
      failed++
      if (newAttempts >= MAX_ATTEMPTS) {
        // Max attempts reached — leave with delivered_at null so it's queryable as permanently failed
        await admin
          .from('webhook_queue')
          .update({
            attempts: newAttempts,
            last_error: result.error ?? 'unknown error',
            // next_retry_at left as-is so it doesn't get picked up again
            delivered_at: null,
          })
          .eq('id', entry.id)
      } else {
        await admin
          .from('webhook_queue')
          .update({
            attempts: newAttempts,
            last_error: result.error ?? 'unknown error',
            next_retry_at: nextRetryAt(newAttempts),
          })
          .eq('id', entry.id)
      }
    }
  }

  return { processed, failed }
}

/**
 * Starts a background interval that processes the webhook queue every `intervalMs` ms.
 * Returns a cleanup function that stops the interval.
 */
export function startWebhookWorker(
  cfg: SupabaseAuthConfig,
  intervalMs = 30_000,
): () => void {
  const timer = setInterval(() => {
    processWebhookQueue(cfg).catch((err) => {
      console.error('[webhook-worker] processWebhookQueue error:', err)
    })
  }, intervalMs)

  // Unref so the interval doesn't prevent process exit
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    ;(timer as NodeJS.Timeout).unref()
  }

  return () => clearInterval(timer)
}
