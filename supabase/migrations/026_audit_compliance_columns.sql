-- Add compliance-queryable columns to audit_events
-- anomaly_flags: surface from payload as a top-level indexed column for efficient compliance queries
-- resolved_by:   who made the human resolution decision (user email or 'operator')

ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS anomaly_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resolved_by   text;

-- Index for compliance queries filtering on anomaly presence
CREATE INDEX IF NOT EXISTS audit_events_anomaly_flags_gin
  ON public.audit_events USING gin (anomaly_flags)
  WHERE anomaly_flags != '[]'::jsonb;

-- Index for compliance queries counting human reviews
CREATE INDEX IF NOT EXISTS audit_events_resolved_by
  ON public.audit_events (org_id, resolved_by)
  WHERE resolved_by IS NOT NULL;

-- Backfill anomaly_flags and resolved_by from the payload JSONB for existing rows
-- payload stores the full ActionResult — anomalyFlags is an array, resolvedBy is a string
UPDATE public.audit_events
SET
  anomaly_flags = COALESCE(payload -> 'anomalyFlags', '[]'::jsonb),
  resolved_by   = payload ->> 'resolvedBy'
WHERE anomaly_flags = '[]'::jsonb
  AND payload IS NOT NULL
  AND payload != '{}'::jsonb;

COMMENT ON COLUMN public.audit_events.anomaly_flags IS 'Array of anomaly flag strings detected on this action (e.g. suspicious_prompt, privilege_escalation)';
COMMENT ON COLUMN public.audit_events.resolved_by    IS 'User email or system identifier that resolved a REQUIRE_VERIFICATION decision';
