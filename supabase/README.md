# Supabase schema (Sanctum)

## Tables

| Migration | Objects |
|-----------|---------|
| `001_profiles.sql` | `profiles`, auth trigger `handle_new_user` |
| `002_audit_events.sql` | `audit_events` (API mirror) |
| `003_functions.sql` | `set_updated_at()` |
| `004_organizations.sql` | `organizations`, `organization_members` |
| `005_runtime_policies.sql` | `runtime_policies` (cloud policy store) |
| `006_webhook_deliveries.sql` | `webhook_deliveries` |
| `007_views_and_audit_fixes.sql` | indexes, `pending_verifications` view |
| `008_auth_portal.sql` | `portal_type`, enterprise domains, org bootstrap, `my_profile` |
| `009_api_keys.sql` | Operator API key registry (hash + prefix) |
| `010_control_plane.sql` | Runtime registry, agents, event stream |
| `011_api_keys_openai_style.sql` | Peppered bcrypt hashes, key suffix display, scopes |

## Deploy to linked project

```bash
supabase login
supabase link --project-ref nimvcudvrhanxlcpiizz   # once
npm run db:push
```

Or apply manually: Supabase Dashboard → **SQL Editor** → run each file in `migrations/` in order.

## Local env

```bash
npm run env:pull    # writes VITE_SUPABASE_* + SUPABASE_* to .env
```

## API behavior when configured

- **Audit** → upsert `audit_events`
- **Policies** → load/merge `runtime_policies` on startup; sync on change
- **Webhooks** → log rows in `webhook_deliveries`

Requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on the API (see [SUPABASE_SETUP.md](../SUPABASE_SETUP.md)).
