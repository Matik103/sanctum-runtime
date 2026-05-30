/** Fire-and-forget Connect Agent webhook for held/blocked proxy events. */
import { logger } from './logger.js'

const log = logger.child({ module: 'connect-notify' })

export function emitConnectWebhook(
  url: string | null | undefined,
  payload: Record<string, unknown>,
): void {
  if (!url?.trim()) return
  void fetch(url.trim(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sanctum-event': 'connect.agent' },
    body: JSON.stringify({ ...payload, source: 'sanctum-connect', at: new Date().toISOString() }),
  }).catch((err) => {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'connect webhook failed')
  })
}
