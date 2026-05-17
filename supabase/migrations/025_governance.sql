-- Governance: approval workflows, delegation chains, policy snapshots, webhook queue

-- Multi-step approval workflows
CREATE TABLE IF NOT EXISTS approval_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  action_pattern text NOT NULL, -- glob pattern e.g. "transfer_funds*", "delete_*"
  steps jsonb NOT NULL DEFAULT '[]', -- [{role: 'admin', required_count: 1}, {role: 'owner', required_count: 1}]
  expiry_minutes int NOT NULL DEFAULT 60,
  escalation_after_minutes int, -- escalate to next role if not approved in time
  escalation_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_workflows_org ON approval_workflows(org_id) WHERE is_active = true;

-- Pending approvals waiting for human decision
CREATE TABLE IF NOT EXISTS pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  audit_event_id uuid, -- references audit_events if applicable
  workflow_id uuid REFERENCES approval_workflows(id),
  action text NOT NULL,
  params jsonb DEFAULT '{}',
  actor text,
  context jsonb DEFAULT '{}',
  current_step int NOT NULL DEFAULT 0,
  approvals jsonb NOT NULL DEFAULT '[]', -- [{user_id, role, decision, note, timestamp}]
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','escalated')),
  expires_at timestamptz NOT NULL,
  escalated_at timestamptz,
  final_decision text CHECK (final_decision IN ('APPROVED','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_approvals_org_status ON pending_approvals(org_id, status);
CREATE INDEX IF NOT EXISTS pending_approvals_expires ON pending_approvals(expires_at) WHERE status = 'pending';

-- Policy version snapshots
CREATE TABLE IF NOT EXISTS policy_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  label text,
  change_summary text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS policy_snapshots_org ON policy_snapshots(org_id, created_at DESC);

-- Agent delegation chains
CREATE TABLE IF NOT EXISTS agent_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_agent_id text NOT NULL,
  child_agent_id text NOT NULL,
  granted_actions text[] NOT NULL DEFAULT '{}', -- empty = all actions
  context jsonb DEFAULT '{}',
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_delegations_child ON agent_delegations(org_id, child_agent_id);
CREATE INDEX IF NOT EXISTS agent_delegations_parent ON agent_delegations(org_id, parent_agent_id);

-- Webhook delivery queue for durable retry
CREATE TABLE IF NOT EXISTS webhook_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  url text NOT NULL,
  secret_hash text, -- HMAC key for signing (hashed)
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_queue_pending ON webhook_queue(next_retry_at)
  WHERE delivered_at IS NULL AND attempts < max_attempts;

COMMENT ON TABLE approval_workflows IS 'Multi-step human approval workflow definitions per org';
COMMENT ON TABLE pending_approvals IS 'Queued actions awaiting human approval decisions';
COMMENT ON TABLE policy_snapshots IS 'Immutable policy version snapshots for compliance audit trail';
COMMENT ON TABLE agent_delegations IS 'Trust-chain delegation grants from parent to child agents';
COMMENT ON TABLE webhook_queue IS 'Durable webhook delivery queue with exponential-backoff retry';
