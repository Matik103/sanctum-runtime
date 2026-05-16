import type { WebhookEvent } from './webhooks.js'
import { getSupabaseServiceClient } from './supabase-client.js'

export async function logWebhookDelivery(opts: {
  event: WebhookEvent
  targetUrl: string
  statusCode?: number
  success: boolean
  payload: unknown
  errorMessage?: string
  durationMs?: number
}): Promise<void> {
  const sb = getSupabaseServiceClient()
  if (!sb) return

  const { error } = await sb.from('webhook_deliveries').insert({
    event: opts.event,
    target_url: opts.targetUrl,
    status_code: opts.statusCode ?? null,
    success: opts.success,
    payload: opts.payload,
    error_message: opts.errorMessage ?? null,
    duration_ms: opts.durationMs ?? null,
  })

  if (error) {
    console.error('[sanctum] webhook delivery log failed:', error.message)
  }
}
