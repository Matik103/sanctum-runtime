/**
 * Lightweight in-memory HTTP metrics for the `/metrics` Prometheus scrape.
 *
 * Kept dependency-free on purpose — adding prom-client would pull a transitive
 * tree and we only need counters + a fixed-bucket histogram. Resets on
 * process restart, which matches the rest of our in-memory state.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'

type StatusClass = '2xx' | '3xx' | '4xx' | '5xx'

// Bucket upper bounds in seconds — Prometheus convention (le = "less than or equal")
const LATENCY_BUCKETS_SEC = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

// Threshold above which we emit a structured slow-request log line
const SLOW_REQUEST_MS = 1000

interface Counters {
  reqTotal: number
  reqByStatusClass: Record<StatusClass, number>
  reqByMethod: Record<string, number>
  // Histogram buckets — index aligned with LATENCY_BUCKETS_SEC; last entry is +Inf
  latencyBuckets: number[]
  latencySumSec: number
  latencyCount: number
}

const counters: Counters = {
  reqTotal: 0,
  reqByStatusClass: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
  reqByMethod: {},
  latencyBuckets: new Array(LATENCY_BUCKETS_SEC.length + 1).fill(0),
  latencySumSec: 0,
  latencyCount: 0,
}

function statusClass(code: number): StatusClass {
  if (code >= 500) return '5xx'
  if (code >= 400) return '4xx'
  if (code >= 300) return '3xx'
  return '2xx'
}

// Group dynamic IDs into route templates so cardinality stays bounded.
// Without this, /v1/audit/abc123/resolve and /v1/audit/xyz789/resolve become
// distinct buckets and the metrics endpoint balloons.
function normalizeRoute(url: string): string {
  const path = url.split('?')[0]
  return path
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    .replace(/\/\d{2,}/g, '/:id')
}

export function attachHttpMetrics(app: FastifyInstance): void {
  app.addHook('onRequest', async (req) => {
    ;(req as { _startNs?: bigint })._startNs = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const start = (req as { _startNs?: bigint })._startNs
    if (start === undefined) return

    const durNs = process.hrtime.bigint() - start
    const durSec = Number(durNs) / 1e9
    const durMs  = durSec * 1000

    counters.reqTotal += 1
    counters.reqByStatusClass[statusClass(reply.statusCode)] += 1
    counters.reqByMethod[req.method] = (counters.reqByMethod[req.method] ?? 0) + 1

    counters.latencySumSec += durSec
    counters.latencyCount  += 1
    let bucketed = false
    for (let i = 0; i < LATENCY_BUCKETS_SEC.length; i++) {
      if (durSec <= LATENCY_BUCKETS_SEC[i]) {
        counters.latencyBuckets[i] += 1
        bucketed = true
        break
      }
    }
    if (!bucketed) counters.latencyBuckets[LATENCY_BUCKETS_SEC.length] += 1

    if (durMs >= SLOW_REQUEST_MS) {
      req.log.warn({
        slow: true,
        durationMs: Math.round(durMs),
        method: req.method,
        route: normalizeRoute(req.url),
        status: reply.statusCode,
      }, 'slow request')
    }
  })
}

export function renderHttpMetrics(): string[] {
  const lines: string[] = [
    '# HELP sanctum_http_requests_total HTTP requests served, partitioned by status class',
    '# TYPE sanctum_http_requests_total counter',
    `sanctum_http_requests_total{status="2xx"} ${counters.reqByStatusClass['2xx']}`,
    `sanctum_http_requests_total{status="3xx"} ${counters.reqByStatusClass['3xx']}`,
    `sanctum_http_requests_total{status="4xx"} ${counters.reqByStatusClass['4xx']}`,
    `sanctum_http_requests_total{status="5xx"} ${counters.reqByStatusClass['5xx']}`,
    '# HELP sanctum_http_requests_by_method_total HTTP requests served, by method',
    '# TYPE sanctum_http_requests_by_method_total counter',
  ]
  for (const [method, count] of Object.entries(counters.reqByMethod)) {
    lines.push(`sanctum_http_requests_by_method_total{method="${method}"} ${count}`)
  }
  lines.push(
    '# HELP sanctum_http_request_duration_seconds HTTP request latency in seconds',
    '# TYPE sanctum_http_request_duration_seconds histogram',
  )
  let cumulative = 0
  for (let i = 0; i < LATENCY_BUCKETS_SEC.length; i++) {
    cumulative += counters.latencyBuckets[i]
    lines.push(`sanctum_http_request_duration_seconds_bucket{le="${LATENCY_BUCKETS_SEC[i]}"} ${cumulative}`)
  }
  cumulative += counters.latencyBuckets[LATENCY_BUCKETS_SEC.length]
  lines.push(`sanctum_http_request_duration_seconds_bucket{le="+Inf"} ${cumulative}`)
  lines.push(`sanctum_http_request_duration_seconds_sum ${counters.latencySumSec.toFixed(6)}`)
  lines.push(`sanctum_http_request_duration_seconds_count ${counters.latencyCount}`)
  return lines
}
