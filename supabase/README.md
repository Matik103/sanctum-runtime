# Supabase schema (Sanctum)

## Migrations (001–027)

| # | File | Objects |
|---|------|---------|
| 001 | `001_profiles.sql` | `profiles`, auth trigger `handle_new_user` |
| 002 | `002_audit_events.sql` | `audit_events` (API mirror) |
| 003 | `003_functions.sql` | `set_updated_at()` |
| 004 | `004_organizations.sql` | `organizations`, `organization_members` |
| 005 | `005_runtime_policies.sql` | `runtime_policies` (cloud policy store) |
| 006 | `006_webhook_deliveries.sql` | `webhook_deliveries` |
| 007 | `007_views_and_audit_fixes.sql` | indexes, `pending_verifications` view |
| 008 | `008_auth_portal.sql` | `portal_type`, enterprise domains, org bootstrap, `my_profile` |
| 009 | `009_api_keys.sql` | Operator API key registry (hash + prefix) |
| 010 | `010_control_plane.sql` | `registered_runtimes`, `registered_agents`, `runtime_events` |
| 011 | `011_api_keys_openai_style.sql` | Peppered bcrypt hashes, key suffix display, scopes |
| 012 | `012_api_keys_delete_policy.sql` | API key delete RLS |
| 013 | `013_api_keys_org_backfill.sql` | Org linkage on keys |
| 014 | `014_phase3_attestation.sql` | Runtime attestation columns |
| 015 | `015_phase4_orchestration.sql` | `deployment_groups`, `runtime_commands` |
| 016 | `016_agent_memory.sql` | `agent_memory_entries` |
| 017 | `017_runtime_marketplace.sql` | `runtime_packages`, `runtime_package_installs` |
| 018 | `018_usage_metering.sql` | `usage_events` |
| 019 | `019_hardware_attestation.sql` | `attestation_challenges` |
| 020 | `020_marketplace_catalog_fixes.sql` | Harden original 3 catalog packages |
| 021 | `021_marketplace_expand_catalog.sql` | +6 integration packages |
| 022 | `022_marketplace_twelve_categories.sql` | 12 categories, +6 primary packages |
| 023 | `023_billing_plans.sql` | `plans`, `org_plans`, free-plan trigger |
| 024 | `024_notifications_sso.sql` | `sso_configs`, `export_audit`, notification columns on `org_plans` |
| 025 | `025_governance.sql` | `approval_workflows`, `pending_approvals`, `policy_snapshots`, `agent_delegations`, `webhook_queue` |
| 026 | `026_audit_compliance_columns.sql` | `audit_events.anomaly_flags`, `resolved_by` |
| 027 | `027_rls_governance_and_hardening.sql` | RLS on governance + `plans`; `is_org_member` / `is_org_role`; tighten audit/webhook/api_keys policies |

## Deploy to linked project

```bash
supabase login
supabase link --project-ref YOUR_REF   # once
npm run db:push
```

Or apply manually: Supabase Dashboard → **SQL Editor** → run each file in `migrations/` in order.

## Post-push checks

```sql
select count(*) from public.runtime_packages where visibility = 'public';  -- expect 16
select count(*) from public.plans;                                         -- expect 4
select count(*) from public.organizations o
  left join public.org_plans p on p.org_id = o.id where p.org_id is null;  -- expect 0

-- After 027: every public table should have RLS on
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
```

## Local env

```bash
npm run env:pull    # writes VITE_SUPABASE_* + SUPABASE_* to .env
```

## Free-tier safety

The Sanctum API (`apps/api/src/supabase-limits.ts`) enforces per-query timeouts and row caps so PostgREST does not hit the free plan’s ~8s statement limit. Heavy endpoints (GDPR export, compliance reports) use **sequential** reads, not parallel fan-out.

If exports return `warnings` in JSON, the database was slow or a section was capped — retry or upgrade when you need full history.

## API behavior when configured

- **Audit** → upsert `audit_events`
- **Policies** → load/merge `runtime_policies` on startup; sync on change
- **Webhooks** → log rows in `webhook_deliveries`
- **Fleet** → `registered_runtimes` / `registered_agents` / `runtime_events`
- **Marketplace** → `runtime_packages` + `runtime_package_installs`
- **Usage / billing** → `usage_events` + `org_plans` / `plans`

Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the API (see [SUPABASE_SETUP.md](../SUPABASE_SETUP.md)).
