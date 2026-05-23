# Sanctum Mobile Runtime Companion (PWA)

The console at **https://console.sanctumruntime.com** doubles as the **mobile trust control layer** — not a separate native app.

## Brand / notification icons (production)

Use these stable URLs (see `docs/BRAND_ASSETS.md`):

| Use | URL |
|-----|-----|
| Web Push notification icon | https://console.sanctumruntime.com/favicon-512.png |
| PWA install icon | https://console.sanctumruntime.com/favicon-512.png |
| Wordmark | https://console.sanctumruntime.com/sanctum-logo.png |

## What users get

- **Install to home screen** (Android Chrome, desktop, iOS Safari 16.4+)
- **Standalone fullscreen** UI with companion navigation
- **Trust score + live activity feed** on mobile overview
- **Verification queue** — same `VerificationModal` as desktop
- **Web Push** (when VAPID keys are configured)

## Install

1. Sign in to the console.
2. On supported browsers, tap **Install** in the banner, or use the browser menu → **Add to Home Screen**.
3. Open **Sanctum** from the home screen icon.

## Architecture

```
AI Agent → Sanctum Runtime → VERIFY decision
                ↓
         API / webhooks / email
                ↓
    Web Push → PWA → user approves/denies
```

The phone **supervises** runtime behavior; it does not run the policy engine.

## Push notifications setup

Generate VAPID keys (once per environment):

```bash
npx web-push generate-vapid-keys
```

Add to the **Render API service**:

| Variable | Where |
|----------|--------|
| `VAPID_PUBLIC_KEY` | API — public key exposed through `/v1/push/vapid-key` |
| `VAPID_PRIVATE_KEY` | API only — secret |
| `VAPID_SUBJECT` | API — e.g. `mailto:ops@yourdomain.com` |

The dashboard does not need the public VAPID key baked into its static bundle; it loads
the configured public key from the API. `VITE_VAPID_PUBLIC_KEY` remains a backward-compatible
API alias only.

Apply all current Supabase migrations, including `048_push_subscriptions_consolidated.sql`:

```bash
# or
npm run db:push   # if SUPABASE_DB_PASSWORD is set
```

Users enable push under **Settings → Mobile push notifications**.

## Database

`public.push_subscriptions` — one row per browser endpoint per user. Written by API with service role.

The service worker deliberately does not cache authenticated API responses. Offline UI
assets remain available, while audit, credential, and policy data must be fetched after
the operator is authenticated and online.

## Sending pushes from code

```ts
import { sendPushToUser } from './push-routes.js'

await sendPushToUser(userId, {
  title: 'Sanctum Verification Required',
  body: 'Agent requested: unlock_door',
  url: '/',
  requireInteraction: true,
})
```

Wire this into verification-required webhooks when you want automatic mobile alerts.

## iOS notes

- Push requires the PWA to be **installed** to the home screen (iOS 16.4+).
- Permission prompt only appears after user taps **Enable push** in Settings.

## What we are not building yet

- React Native / App Store / Play Store
- On-device policy engine
- Offline approval cache

Those come after real adoption and verification volume.
