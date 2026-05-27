/**
 * Heap-pressure watchdog. V8 has a hard heap ceiling (default ~1.7GiB on
 * Node 22, configurable via --max-old-space-size). When the process gets
 * close, GC thrashes and eventually OOM-kills the container with no notice
 * in Render's log stream beyond an exit code.
 *
 * This polls heap usage every 30s. At 85% we emit a WARN line so operators
 * have time to size up the instance; at 95% we emit ERROR so an aggregator
 * can page. The ratio is also exposed via getHeapPressureRatio() for the
 * /metrics endpoint.
 */
import { getHeapStatistics } from 'v8'
import { logger as rootLogger } from './logger.js'

const log = rootLogger.child({ worker: 'heap-watchdog' })

const POLL_INTERVAL_MS = 30_000
const WARN_RATIO = 0.85
const ERROR_RATIO = 0.95

let lastRatio = 0
let lastLevel: 'ok' | 'warn' | 'error' = 'ok'

export function getHeapPressureRatio(): number {
  return lastRatio
}

function poll(): void {
  const s = getHeapStatistics()
  const ratio = s.used_heap_size / s.heap_size_limit
  lastRatio = ratio

  const usedMb = Math.round(s.used_heap_size / 1024 / 1024)
  const limitMb = Math.round(s.heap_size_limit / 1024 / 1024)
  const pct = (ratio * 100).toFixed(1)

  let level: 'ok' | 'warn' | 'error' = 'ok'
  if (ratio >= ERROR_RATIO) level = 'error'
  else if (ratio >= WARN_RATIO) level = 'warn'

  // Only log on transitions or while in a degraded state — avoids 30s spam
  // when the heap is happily idle, but keeps a steady drip while pressured
  // so we can correlate against traffic.
  if (level === 'error') {
    log.error({ usedMb, limitMb, pct: `${pct}%` }, 'CRITICAL heap pressure')
  } else if (level === 'warn') {
    log.warn({ usedMb, limitMb, pct: `${pct}%` }, 'elevated heap pressure')
  } else if (lastLevel !== 'ok') {
    log.info({ usedMb, limitMb, pct: `${pct}%` }, 'heap pressure recovered')
  }
  lastLevel = level
}

export function startHeapWatchdog(): () => void {
  poll() // initial sample so /metrics has a value immediately
  const timer = setInterval(poll, POLL_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
