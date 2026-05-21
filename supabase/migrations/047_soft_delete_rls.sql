-- Enforce soft-delete visibility in RLS so deleted rows never appear in client queries.
-- The API already filters deleted_at IS NULL in application code; RLS adds a second
-- layer so direct Supabase client queries are also safe.

-- registered_runtimes: replace existing SELECT policy with one that excludes soft-deleted rows
DROP POLICY IF EXISTS "registered_runtimes_select_org_member" ON public.registered_runtimes;
DROP POLICY IF EXISTS "org members can read registered_runtimes" ON public.registered_runtimes;

CREATE POLICY "registered_runtimes_select_live"
  ON public.registered_runtimes FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = registered_runtimes.org_id
        AND m.user_id = auth.uid()
    )
  );

-- registered_agents: replace existing SELECT policy similarly
DROP POLICY IF EXISTS "registered_agents_select_runtime_org" ON public.registered_agents;
DROP POLICY IF EXISTS "org members can read registered_agents" ON public.registered_agents;

CREATE POLICY "registered_agents_select_live"
  ON public.registered_agents FOR SELECT
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.registered_runtimes r
      JOIN public.organization_members m ON m.org_id = r.org_id
      WHERE r.id = registered_agents.runtime_id
        AND m.user_id = auth.uid()
        AND r.deleted_at IS NULL
    )
  );
