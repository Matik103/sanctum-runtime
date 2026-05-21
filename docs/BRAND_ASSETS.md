# Brand assets — canonical URLs

Stable production URLs for Firebase, FCM, PWA, and social previews.

## Console (`console.sanctumruntime.com`)

| Asset | URL |
|-------|-----|
| Logo (wordmark) | https://console.sanctumruntime.com/sanctum-logo.png |
| Favicon 32×32 | https://console.sanctumruntime.com/favicon.png |
| Icon 512×512 (PWA, FCM notification icon) | https://console.sanctumruntime.com/favicon-512.png |
| Apple touch 180×180 | https://console.sanctumruntime.com/apple-touch-icon.png |

**FCM / push:** use `favicon-512.png` as the notification `icon` URL.

## Marketing (`www.sanctumruntime.com`)

| Asset | URL |
|-------|-----|
| Logo (wordmark) | https://www.sanctumruntime.com/sanctum-logo.png |
| Favicon 32×32 | https://www.sanctumruntime.com/favicon.png |
| Icon 512×512 | https://www.sanctumruntime.com/favicon-512.png |
| Apple touch 180×180 | https://www.sanctumruntime.com/apple-touch-icon.png |

Navbar/footer may still load a hashed build asset (`/assets/sanctum-logo-*.png`); the paths above are **stable** across deploys.

## Repo paths

| Asset | Path |
|-------|------|
| Source logo | `src/assets/sanctum-logo.png` |
| Marketing static | `public/sanctum-logo.png`, `public/favicon.png`, `public/favicon-512.png` |
| Console static | `apps/dashboard/public/sanctum-logo.png`, `apps/dashboard/public/favicon*.png` |

## Local dev

- Console: http://127.0.0.1:5174/favicon-512.png
- Marketing: http://127.0.0.1:8080/favicon-512.png (or your `SITE_PORT`)
