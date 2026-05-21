-- RLS hardening: governance tables (025), shared org helpers, tighten legacy policies.
-- API uses service_role (bypasses RLS). Authenticated dashboard users: read via org membership;
-- writes on sensitive tables remain API-only unless noted (admin/owner).

-- ─── Helpers (SECURITY DEFINER — safe membership checks) ─────────────────────

create or replace function public.is_org_member(check_org_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = check_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_role(check_org_id text, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = check_org_id
      and m.user_id = auth.uid()
      and m.role = any (allowed_roles)
  );
$$;

revoke all on function public.is_org_member(text) from public;
revoke all on function public.is_org_role(text, text[]) from public;
grant execute on function public.is_org_member(text) to authenticated;
grant execute on function public.is_org_role(text, text[]) to authenticated;

comment on function public.is_org_member(text) is 'True when auth.uid() belongs to check_org_id';
comment on function public.is_org_role(text, text[]) is 'True when auth.uid() has one of allowed_roles in check_org_id';

-- ─── Plans (public catalog) ───────────────────────────────────────────────────

alter table public.plans enable row level security;

drop policy if exists "plans_select_all" on public.plans;
create policy "plans_select_all"
  on public.plans for select
  using (true);

-- ─── Fix: audit_events (org members only; no null-org leak) ───────────────────

drop policy if exists "audit_select_org" on public.audit_events;
create policy "audit_select_org_member"
  on public.audit_events for select
  using (
    org_id is not null
    and public.is_org_member(org_id)
  );

-- ─── Fix: runtime_policies (org-scoped reads only) ────────────────────────────

drop policy if exists "runtime_policies_select" on public.runtime_policies;
create policy "runtime_policies_select_org_member"
  on public.runtime_policies for select
  using (
    org_id is not null
    and public.is_org_member(org_id)
  );

-- ─── Fix: webhook_deliveries (API / service role only) ───────────────────────

drop policy if exists "webhook_deliveries_select_authenticated" on public.webhook_deliveries;

-- ─── Fix: api_keys (must belong to org when org_id is set) ────────────────────

drop policy if exists "api_keys_insert_own" on public.api_keys;
create policy "api_keys_insert_own"
  on public.api_keys for insert
  with check (
    user_id = auth.uid()
    and (org_id is null or public.is_org_member(org_id))
  );

-- ─── Fix: sso_configs (explicit owner-only CRUD) ─────────────────────────────

drop policy if exists "sso_configs_owner_only" on public.sso_configs;

create policy "sso_configs_select_owner"
  on public.sso_configs for select
  using (public.is_org_role(org_id, array['owner']));

create policy "sso_configs_insert_owner"
  on public.sso_configs for insert
  with check (public.is_org_role(org_id, array['owner']));

create policy "sso_configs_update_owner"
  on public.sso_configs for update
  using (public.is_org_role(org_id, array['owner']))
  with check (public.is_org_role(org_id, array['owner']));

create policy "sso_configs_delete_owner"
  on public.sso_configs for delete
  using (public.is_org_role(org_id, array['owner']));

-- ─── 025 governance tables ───────────────────────────────────────────────────

alter table public.approval_workflows enable row level security;
alter table public.pending_approvals enable row level security;
alter table public.policy_snapshots enable row level security;
alter table public.agent_delegations enable row level security;
alter table public.webhook_queue enable row level security;

-- Members read; admins/owners manage workflows
create policy "approval_workflows_select_member"
  on public.approval_workflows for select
  using (public.is_org_member(org_id));

create policy "approval_workflows_insert_admin"
  on public.approval_workflows for insert
  with check (public.is_org_role(org_id, array['owner', 'admin']));

create policy "approval_workflows_update_admin"
  on public.approval_workflows for update
  using (public.is_org_role(org_id, array['owner', 'admin']))
  with check (public.is_org_role(org_id, array['owner', 'admin']));

create policy "approval_workflows_delete_admin"
  on public.approval_workflows for delete
  using (public.is_org_role(org_id, array['owner', 'admin']));

-- Pending approvals: members read; admins/owners may update (approve/reject)
create policy "pending_approvals_select_member"
  on public.pending_approvals for select
  using (public.is_org_member(org_id));

create policy "pending_approvals_update_admin"
  on public.pending_approvals for update
  using (public.is_org_role(org_id, array['owner', 'admin']))
  with check (public.is_org_role(org_id, array['owner', 'admin']));

-- Policy snapshots: read-only for members (writes via API service role)
create policy "policy_snapshots_select_member"
  on public.policy_snapshots for select
  using (public.is_org_member(org_id));

-- Delegations: members read; admins/owners manage
create policy "agent_delegations_select_member"
  on public.agent_delegations for select
  using (public.is_org_member(org_id));

create policy "agent_delegations_insert_admin"
  on public.agent_delegations for insert
  with check (public.is_org_role(org_id, array['owner', 'admin']));

create policy "agent_delegations_update_admin"
  on public.agent_delegations for update
  using (public.is_org_role(org_id, array['owner', 'admin']))
  with check (public.is_org_role(org_id, array['owner', 'admin']));

create policy "agent_delegations_delete_admin"
  on public.agent_delegations for delete
  using (public.is_org_role(org_id, array['owner', 'admin']));

-- Webhook queue: no client policies — service role only (URLs + secret hashes)
alter table public.webhook_queue force row level security;

-- ─── Explicit client write denies (defense in depth) ─────────────────────────
-- Tables that are API-written only; SELECT policies already exist from earlier migrations.

create policy "pending_approvals_no_client_insert"
  on public.pending_approvals for insert
  with check (false);

create policy "pending_approvals_no_client_delete"
  on public.pending_approvals for delete
  using (false);

create policy "policy_snapshots_no_client_write"
  on public.policy_snapshots for insert
  with check (false);

create policy "policy_snapshots_no_client_update"
  on public.policy_snapshots for update
  using (false);

create policy "policy_snapshots_no_client_delete"
  on public.policy_snapshots for delete
  using (false);

create policy "registered_runtimes_no_client_write"
  on public.registered_runtimes for insert
  with check (false);

create policy "registered_runtimes_no_client_update"
  on public.registered_runtimes for update
  using (false);

create policy "registered_runtimes_no_client_delete"
  on public.registered_runtimes for delete
  using (false);

create policy "registered_agents_no_client_write"
  on public.registered_agents for insert
  with check (false);

create policy "registered_agents_no_client_update"
  on public.registered_agents for update
  using (false);

create policy "registered_agents_no_client_delete"
  on public.registered_agents for delete
  using (false);

create policy "runtime_events_no_client_write"
  on public.runtime_events for insert
  with check (false);

create policy "runtime_events_no_client_update"
  on public.runtime_events for update
  using (false);

create policy "runtime_events_no_client_delete"
  on public.runtime_events for delete
  using (false);

create policy "usage_events_no_client_write"
  on public.usage_events for insert
  with check (false);

create policy "usage_events_no_client_update"
  on public.usage_events for update
  using (false);

create policy "usage_events_no_client_delete"
  on public.usage_events for delete
  using (false);

create policy "agent_memory_no_client_write"
  on public.agent_memory_entries for insert
  with check (false);

create policy "agent_memory_no_client_update"
  on public.agent_memory_entries for update
  using (false);

create policy "agent_memory_no_client_delete"
  on public.agent_memory_entries for delete
  using (false);

create policy "deployment_groups_no_client_write"
  on public.deployment_groups for insert
  with check (false);

create policy "deployment_groups_no_client_update"
  on public.deployment_groups for update
  using (false);

create policy "deployment_groups_no_client_delete"
  on public.deployment_groups for delete
  using (false);

create policy "runtime_commands_no_client_write"
  on public.runtime_commands for insert
  with check (false);

create policy "runtime_commands_no_client_update"
  on public.runtime_commands for update
  using (false);

create policy "runtime_commands_no_client_delete"
  on public.runtime_commands for delete
  using (false);

create policy "attestation_challenges_no_client_write"
  on public.attestation_challenges for insert
  with check (false);

create policy "attestation_challenges_no_client_update"
  on public.attestation_challenges for update
  using (false);

create policy "attestation_challenges_no_client_delete"
  on public.attestation_challenges for delete
  using (false);

create policy "export_audit_no_client_write"
  on public.export_audit for insert
  with check (false);

create policy "export_audit_no_client_update"
  on public.export_audit for update
  using (false);

create policy "export_audit_no_client_delete"
  on public.export_audit for delete
  using (false);

create policy "org_plans_no_client_insert"
  on public.org_plans for insert
  with check (false);

create policy "org_plans_no_client_delete"
  on public.org_plans for delete
  using (false);
