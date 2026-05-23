/**
 * Shared structured logger for modules that run outside the Fastify request
 * lifecycle (background workers, stores, queue processors) and therefore
 * cannot access `app.log` or `req.log`.
 *
 * Outputs the same pino NDJSON format that Fastify uses, so every log line —
 * whether from an HTTP handler or a background webhook worker — is parsed
 * identically by Render's log drain, Datadog, CloudWatch, or any NDJSON-aware
 * collector. Fields: `level`, `time` (Unix ms), `msg`, plus any extra
 * bindings passed at logger creation or call time.
 *
 * Usage:
 *   import { logger } from './logger.js'
 *   logger.warn({ error: err.message, queue: 'webhooks' }, 'webhook delivery failed')
 *
 * A child logger pins extra fields to every subsequent call, useful for workers:
 *   const log = logger.child({ worker: 'email-queue' })
 *   log.error({ attempt }, 'email send failed')
 */

import pino from 'pino'

const level = (process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase()

export const logger = pino({
  level,
  // Match Fastify's default serializers so log lines look uniform.
  serializers: {
    err: pino.stdSerializers.err,
  },
  // Fastify timestamps as Unix ms; keep the same format.
  timestamp: pino.stdTimeFunctions.unixTime,
})
