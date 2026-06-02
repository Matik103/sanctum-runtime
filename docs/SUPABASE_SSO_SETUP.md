# Console SSO setup (Google + GitHub)

Sanctum Runtime uses **Supabase Auth** for dashboard sign-in. Enterprise SSO on the console supports **Google** and **GitHub** only (Microsoft Entra is not enabled).

| Console button | Supabase provider | External console |
|----------------|-------------------|------------------|
| Google | `google` | [Google Cloud Console](https://console.cloud.google.com/) |
| GitHub | `github` | [GitHub Developer Settings](https://github.com/settings/developers) |

---

## 1. Supabase URL configuration

In [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Authentication** → **URL configuration**:

| Field | Value |
|-------|--------|
| **Site URL** | `https://console.sanctumruntime.com` |
| **Redirect URLs** | `https://console.sanctumruntime.com/**` |
| | `http://localhost:5174/**` (local dashboard) |

Copy your **Callback URL** from **Authentication** → **Providers** (any OAuth provider page):

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Use this exact URL in Google and GitHub — do not point them at the console host directly.

---

## 2. Google (Google Cloud)

1. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID** → type **Web application**.
3. **Authorized JavaScript origins** (optional but recommended):
   - `https://console.sanctumruntime.com`
   - `http://localhost:5174`
4. **Authorized redirect URIs**:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client secret**.

In Supabase → **Authentication** → **Providers** → **Google**:

- Enable Google
- Paste Client ID and Client secret
- Save

**OAuth consent screen** (same project):

- User type: External (or Internal if Google Workspace only)
- App name: **Sanctum Runtime**
- Support email: your ops address
- **Privacy policy**: `https://www.sanctumruntime.com/privacy`
- **Terms**: `https://www.sanctumruntime.com/terms`

---

## 3. GitHub

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**.
2. Fill in:

| Field | Value |
|-------|--------|
| Application name | Sanctum Runtime Console |
| Homepage URL | `https://console.sanctumruntime.com` |
| Authorization callback URL | `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |

3. Create app → generate **Client secret**.

In Supabase → **Authentication** → **Providers** → **GitHub**:

- Enable GitHub
- Paste Client ID and Client secret
- Save

---

## 4. Enterprise domain auto-join (optional)

To attach `@yourcompany.com` users to an org on first SSO sign-in:

```sql
insert into public.organizations (id, name)
values ('your-org-id', 'Your Company')
on conflict (id) do nothing;

insert into public.organization_domains (domain, org_id, verified)
values ('yourcompany.com', 'your-org-id', true)
on conflict (domain) do nothing;
```

Users must sign in via **Enterprise** → Google or GitHub so `portal_type` is `enterprise` (set automatically by the console).

---

## 5. Account types (console sign-up)

| Type | Form | Org created |
|------|------|-------------|
| **Individual** | Email, password, confirm | Personal workspace `personal-…` (owner) |
| **Organization** | Org name, primary contact, email, password, confirm | Named company org (signup user = **owner**) |
| **Company SSO** | Sign in only → Google/GitHub | Joins existing org via `organization_domains` |

## 6. Database migrations

Apply auth migrations (if not already):

```bash
npm run db:push
```

Requires **034**–**036** (portal sync, enterprise SSO RPC, individual/organization signup).

## 7. Production checklist (your project)

| Item | Status |
|------|--------|
| Supabase Site URL = `https://console.sanctumruntime.com` | ✓ (from your screenshot) |
| Redirect URLs include `https://console.sanctumruntime.com/**` | ✓ |
| Google provider enabled + keys saved | ✓ |
| GitHub provider enabled + keys saved | ✓ |
| `organization_domains` rows for your company email domain | You configured in DB |
| Render dashboard: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Confirm on Render |
| `npm run db:push` for migration 035 | Run locally |

Project callback (for Google/GitHub redirect URIs):

```text
https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
```

## 8. Verify

1. Open `https://console.sanctumruntime.com`.
2. Choose **Enterprise** → **Continue with Google** or **Continue with GitHub**.
3. Sign in with an email on a mapped domain (e.g. `@yourcompany.com` in `organization_domains`).
4. Console runs `bootstrap_enterprise_org_for_user` and opens the control plane.

**Operator** sign-up (email/password) is unchanged — use the **Operator** tab for personal `personal-…` workspaces.

If redirect fails, re-check **Redirect URLs** in Supabase and the callback URL in Google/GitHub.

If you see **No organization access**, your domain is not in `organization_domains` or `verified` is false — fix in SQL and click **Retry**.

---

## Per-org OIDC (Team / Enterprise API)

Separate from dashboard login: org owners can configure custom OIDC via API (`PUT /v1/orgs/{orgId}/sso`) and `sso_configs` table. That path is for customer IdPs, not Supabase social login.

See [SUPABASE_SETUP.md](../SUPABASE_SETUP.md) for database migrations and env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` on the dashboard build).
