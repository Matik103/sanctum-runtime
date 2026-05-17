/**
 * Lightweight structured tracing.
 *
 * Emits spans as structured JSON log lines. Compatible with any log aggregator
 * (Datadog, Grafana Loki, CloudWatch, etc.) and can optionally export to an
 * OTLP HTTP collector if OTEL_EXPORTER_OTLP_ENDPOINT is set.
 *
 * Env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  → e.g. http://localhost:4318
 *   OTEL_SERVICE_NAME             → default: sanctum-api
 *   OTEL_ENVIRONMENT              → default: production
 */

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'sanctum-api'
const ENVIRONMENT = process.env.OTEL_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production'
const OTLP_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.replace(/\/$/, '')

export interface Span {
  traceId: string
  spanId: string
  name: string
  startMs: number
  attrs: Record<string, string | number | boolean>
  end(extraAttrs?: Record<string, string | number | boolean>): void
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function exportOtlp(spans: object[]): Promise<void> {
  if (!OTLP_ENDPOINT) return
  try {
    await fetch(`${OTLP_ENDPOINT}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceSpans: spans }),
    })
  } catch {
    // OTLP export is best-effort — never crash on telemetry failure
  }
}

export function startSpan(
  name: string,
  attrs: Record<string, string | number | boolean> = {},
  parentTraceId?: string,
): Span {
  const traceId = parentTraceId ?? randomHex(16)
  const spanId = randomHex(8)
  const startMs = performance.now()
  const startTime = Date.now()

  return {
    traceId,
    spanId,
    name,
    startMs,
    attrs,
    end(extraAttrs = {}) {
      const durationMs = Math.round(performance.now() - startMs)
      const allAttrs = { ...attrs, ...extraAttrs }

      // Emit structured log line (ingested by log aggregators)
      console.log(JSON.stringify({
        level: 'trace',
        service: SERVICE_NAME,
        env: ENVIRONMENT,
        trace_id: traceId,
        span_id: spanId,
        span: name,
        duration_ms: durationMs,
        ...allAttrs,
      }))

      // Optionally export to OTLP
      if (OTLP_ENDPOINT) {
        const otlpSpan = {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: SERVICE_NAME } },
              { key: 'deployment.environment', value: { stringValue: ENVIRONMENT } },
            ],
          },
          scopeSpans: [{
            spans: [{
              traceId,
              spanId,
              name,
              kind: 2, // SPAN_KIND_SERVER
              startTimeUnixNano: String(startTime * 1_000_000),
              endTimeUnixNano: String((startTime + durationMs) * 1_000_000),
              attributes: Object.entries(allAttrs).map(([k, v]) => ({
                key: k,
                value: typeof v === 'number'
                  ? { doubleValue: v }
                  : typeof v === 'boolean'
                    ? { boolValue: v }
                    : { stringValue: String(v) },
              })),
              status: { code: 1 }, // STATUS_CODE_OK
            }],
          }],
        }
        void exportOtlp([otlpSpan])
      }
    },
  }
}

/** Wrap an async function with a span. */
export async function traced<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
  parentTraceId?: string,
): Promise<T> {
  const span = startSpan(name, attrs, parentTraceId)
  try {
    const result = await fn(span)
    span.end({ ok: true })
    return result
  } catch (err) {
    span.end({ ok: false, error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}
