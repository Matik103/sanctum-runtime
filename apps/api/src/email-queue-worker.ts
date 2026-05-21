/**
 * Background worker that retries failed outbound emails from the email_queue table.
 * Runs every 60s. Picks up to 20 pending emails per tick, attempts delivery,
 * and applies exponential backoff (max 3 attempts, then abandoned with last_error set).
 */

import type { SupabaseAuthConfig } from './auth.js'
import { createSupabaseAdmin } from './auth.js'

const WORKER_INTERVAL_MS = 60_000
const MAX_ATTEMPTS = 3
const BATCH_SIZE = 20

// Backoff in minutes after each failure: attempt 1→5min, 2→30min, 3→abandoned
const BACKOFF_MINUTES = [5, 30]

async function processEmailQueue(cfg: SupabaseAuthConfig): Promise<void> {
  const db = createSupabaseAdmin(cfg)
  const now = new Date().toISOString()

  const { data: rows, error } = await db
    .from('email_queue')
    .select('id, recipient, subject, html, text_body, attempt_count')
    .is('sent_at', null)
    .lte('next_attempt_at', now)
    .lt('attempt_count', MAX_ATTEMPTS)
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error('[email-queue] fetch failed:', error.message)
    return
  }
  if (!rows || rows.length === 0) return

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFICATION_FROM_EMAIL ?? 'Sanctum Runtime Alerts <alerts@sanctumruntime.com>'

  for (const row of rows) {
    const attempt = (row.attempt_count as number) + 1

    if (!apiKey) {
      await db.from('email_queue').update({
        attempt_count: attempt,
        last_error: 'RESEND_API_KEY not set',
        next_attempt_at: new Date(Date.now() + 999_999_999).toISOString(),
      }).eq('id', row.id)
      continue
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [row.recipient],
          subject: row.subject,
          html: row.html,
          text: row.text_body,
        }),
      })

      if (res.ok) {
        await db.from('email_queue').update({
          sent_at: new Date().toISOString(),
          attempt_count: attempt,
          last_error: null,
        }).eq('id', row.id)
        console.log(`[email-queue] delivered to ${row.recipient as string} (attempt ${attempt})`)
      } else {
        const errText = await res.text().catch(() => String(res.status))
        throw new Error(`HTTP ${res.status}: ${errText}`)
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      const backoffMs = (BACKOFF_MINUTES[attempt - 1] ?? 120) * 60_000
      const nextAttempt = new Date(Date.now() + backoffMs).toISOString()

      await db.from('email_queue').update({
        attempt_count: attempt,
        last_error: errMsg.slice(0, 500),
        next_attempt_at: nextAttempt,
      }).eq('id', row.id)

      console.warn(`[email-queue] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${row.recipient as string}:`, errMsg)
    }
  }
}

export function startEmailQueueWorker(cfg: SupabaseAuthConfig): () => void {
  console.log('[email-queue] worker started (60s interval)')

  // Run immediately on startup to clear any queue from previous crash
  void processEmailQueue(cfg).catch((e) => console.error('[email-queue] startup run failed:', e))

  const interval: NodeJS.Timeout = setInterval(() => {
    void processEmailQueue(cfg).catch((e) => console.error('[email-queue] tick failed:', e))
  }, WORKER_INTERVAL_MS)

  interval.unref()
  return () => clearInterval(interval)
}
