-- Add Row Level Security to all tables created in migration 025.
-- Service role (used by the API) bypasses RLS automatically.
-- Authenticated users may only see rows that belong to their org.

-- ── approval_workflows ───────────────────────────────────────────────────────
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read approval_workflows"
  ON public.approval_workflows FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org admins can manage approval_workflows"
  ON public.approval_workflows FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── pending_approvals ─────────────────────────────────────────────────────────
ALTER TABLE public.pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read pending_approvals"
  ON public.pending_approvals FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org admins can manage pending_approvals"
  ON public.pending_approvals FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── policy_snapshots ──────────────────────────────────────────────────────────
ALTER TABLE public.policy_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read policy_snapshots"
  ON public.policy_snapshots FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org admins can manage policy_snapshots"
  ON public.policy_snapshots FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── agent_delegations ─────────────────────────────────────────────────────────
ALTER TABLE public.agent_delegations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read agent_delegations"
  ON public.agent_delegations FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org admins can manage agent_delegations"
  ON public.agent_delegations FOR ALL
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ── webhook_queue ─────────────────────────────────────────────────────────────
-- Webhook queue is service-role only (worker process). Authenticated users
-- have no business reading raw webhook payloads — owners can see status only.
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org owners can read webhook_queue"
  ON public.webhook_queue FOR SELECT
  TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated users — only service role writes.

COMMENT ON TABLE public.approval_workflows IS 'RLS: org members read, admins+owners write';
COMMENT ON TABLE public.pending_approvals  IS 'RLS: org members read, admins+owners write';
COMMENT ON TABLE public.policy_snapshots   IS 'RLS: org members read, admins+owners write';
COMMENT ON TABLE public.agent_delegations  IS 'RLS: org members read, admins+owners write';
COMMENT ON TABLE public.webhook_queue      IS 'RLS: service role only writes; owners can read status';
