-- Add top-level context jsonb column to audit_events.
-- compliance.ts queries context directly for risk distribution and access events.
-- Previously context was only inside the payload JSONB blob.

ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS context jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index to support compliance queries filtering by context fields (e.g. user_id, ip)
CREATE INDEX IF NOT EXISTS audit_events_context_gin
  ON public.audit_events USING gin (context)
  WHERE context != '{}'::jsonb;

-- Backfill context from payload for existing rows
UPDATE public.audit_events
SET context = COALESCE(payload -> 'context', '{}'::jsonb)
WHERE context = '{}'::jsonb
  AND payload IS NOT NULL
  AND payload != '{}'::jsonb
  AND payload -> 'context' IS NOT NULL;

COMMENT ON COLUMN public.audit_events.context IS 'Action context (actor metadata, org, ip, params) — top-level for query efficiency';
