-- Soft-delete support for registered_runtimes and registered_agents.
-- Deleted rows are hidden from application queries but kept for audit history.

ALTER TABLE registered_runtimes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

ALTER TABLE registered_agents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Partial indexes: only live rows are indexed, keeping scans fast
CREATE INDEX IF NOT EXISTS idx_registered_runtimes_live
  ON registered_runtimes (org_id, last_seen_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_registered_agents_live
  ON registered_agents (runtime_id, last_seen_at DESC)
  WHERE deleted_at IS NULL;
