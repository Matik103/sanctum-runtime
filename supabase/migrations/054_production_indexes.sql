-- Production performance indexes.
--
-- Covers three hot query paths that were missing indexes and would cause
-- full-table scans at any meaningful audit volume:
--
--  1. Per-agent audit / stats queries  →  audit_events(actor)
--  2. Shield rule action matching       →  audit_events(action)
--  3. Containment auto-resolve          →  shield_containment_events(audit_id)
--  4. Containment dashboard             →  shield_containment_events(org_id, resolved, created_at)
--  5. Webhook dead-letter query         →  webhook_queue(attempts) partial WHERE delivered_at IS NULL
--
-- All use IF NOT EXISTS / DO $$ guards so the migration is safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. audit_events: per-agent audit log filter (GET /agents/:id/audit)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON public.audit_events (actor, org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. audit_events: action-level pattern matching / policy replay queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON public.audit_events (action, org_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. shield_containment_events: auto-resolve lookup by audit_id
--    (UPDATE ... WHERE audit_id = $1 AND resolved = false)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shield_containment_audit_id
  ON public.shield_containment_events (audit_id)
  WHERE resolved = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. shield_containment_events: dashboard listing (org + resolution status)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shield_containment_org_resolved
  ON public.shield_containment_events (org_id, resolved, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. webhook_queue: dead-letter reporting
--    Only indexes undelivered rows to keep the index small; the query
--    uses this partial index for the dead-letter admin endpoint.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_webhook_queue_dead_letter
  ON public.webhook_queue (attempts DESC, next_retry_at DESC)
  WHERE delivered_at IS NULL;
