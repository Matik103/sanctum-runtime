# Production signup & workspace provisioning

Canonical reference for what every account type must have before billing, Connect, or Fleet work.

## Expected artifacts per account type

| Path | `profiles` | `organizations` | `organization_members` | `org_plans` | `billing_org_id` |
|------|------------|-----------------|----------------------|-------------|------------------|
| **Individual email** | compliance fields, `portal_type=operator` | 1× `personal-{uuid12}` | owner on personal | `observer` (Developer) | `null` until checkout |
| **Organization email** | contact fields, `portal_type=operator` | 1× business tenant (`make_org_id_from_name`) | owner on business org only | `observer` on business org | `null` until checkout |
| **OAuth operator** | `auth_provider`, optional terms | personal workspace | owner | `observer` | `null` |
| **Enterprise SSO** | `portal_type=enterprise` | joins existing tenant by verified domain | `member` on mapped org | `observer` on tenant | `null` |
| **API safety net** | unchanged | personal only for individual operators | owner on personal when needed | `ensure_org_plan_row` on all memberships | via `resolveBillingOrgId` |

UI label for `plan_id = observer` is **Developer** (free observe-only tier).

## Trigger chain

```text
auth.users INSERT
  → handle_new_user (profile upsert + bootstrap if no memberships)
profiles INSERT
  → bootstrap_user_org → bootstrap_user_org_for_profile
organizations INSERT
  → trg_assign_free_plan (redundant with ensure_org_plan_row)
```

Migrations **070** and **071** must be applied in production.

## API safety nets (Render `sanctum-api`)

| Endpoint | Behavior |
|----------|----------|
| `GET /v1/operator/context` | `ensureWorkspaceForUser` — personal workspace **only** for individual operators; skips enterprise and org-signup owners |
| `GET /v1/orgs` | Same workspace ensure |
| `GET /v1/billing/plan` | `ensureOrgPlan` + Developer defaults |

`resolveBillingOrgId` prefers: explicit org → `billing_org_id` → paid Creem org → **owned business org** → personal org.

## Dashboard gates

| Gate | Rule |
|------|------|
| `EnterpriseOrgGate` | Enterprise users need domain-mapped tenant membership (`joinedOrgId` or non-`personal-*` org). Uses Supabase RPC only before gate — not operator context. |
| `ProfileCompletionGate` | Operator OAuth/email without country or terms |

## Pre-production checklist

### Supabase

- [ ] Migrations **061–062**, **070**, **071** applied
- [ ] `on_profile_created_bootstrap` trigger on `profiles` INSERT
- [ ] `on_auth_user_created` → `handle_new_user` on `auth.users`
- [ ] Auth redirect URLs include production console URL
- [ ] Creem webhook URL points to Supabase `creem-webhook`

### Smoke tests

```bash
node scripts/test-signup-forms.mjs   # email individual + org + OAuth metadata
node scripts/test-accounts-e2e.mjs   # full account flows (with .env.e2e.local)
```

Verify manually:

- [ ] Individual → Billing shows **Developer** current, upgrade opens Creem
- [ ] Organization → single business org, no `personal-*` membership, Developer plan
- [ ] Enterprise SSO without verified domain → blocked at gate
- [ ] Enterprise SSO with verified domain → member on tenant, no personal org

### Deploy order

1. Supabase migrations (`supabase db push`)
2. Edge functions (`npm run creem:deploy`)
3. `sanctum-api` (workspace ensure + billing org resolution)
4. `sanctum-dashboard` (gates + OAuth profile sync)

## Related docs

- [CREEM_BILLING_FLOWS.md](./CREEM_BILLING_FLOWS.md) — upgrade/downgrade/cancel
- [CREEM_SUPABASE.md](./CREEM_SUPABASE.md) — Edge Function secrets
- [SUPABASE_SSO_SETUP.md](./SUPABASE_SSO_SETUP.md) — enterprise domain verification
