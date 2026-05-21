# Search Console & Bing Webmaster

Marketing site: **https://www.sanctumruntime.com**

## Already in good shape (production)

| Item | URL / status |
|------|----------------|
| Sitemap (submit in GSC) | https://www.sanctumruntime.com/sitemap.xml |
| robots.txt | https://www.sanctumruntime.com/robots.txt |
| llms.txt | https://www.sanctumruntime.com/llms.txt |
| AI markdown | `/ai/overview.md`, `/ai/architecture.md`, etc. |
| Per-page SEO | Canonical, Open Graph, Twitter via `src/lib/seo.ts` |
| JSON-LD | Organization + SoftwareApplication on all pages; WebPage on AI landing routes |
| Console | `noindex` — https://console.sanctumruntime.com |

Do **not** submit the operator console to Search Console.

---

## 1. Google Search Console (if not done yet)

1. Property: `https://www.sanctumruntime.com`
2. Sitemap: `https://www.sanctumruntime.com/sitemap.xml` (already works — 7 HTML routes)
3. **URL inspection** → request indexing for `/` and `/docs` after major deploys
4. Optional: add **Domain** property for `sanctumruntime.com` (DNS TXT)

### HTML-tag verification (optional)

If Google asks for a meta tag:

1. Copy the `content="…"` value from Search Console
2. Vercel / Cloudflare env: `VITE_GOOGLE_SITE_VERIFICATION=…`
3. Redeploy marketing site
4. Verify in Search Console

Wired in `src/lib/seo.ts` → `searchVerificationMeta()` → `src/routes/__root.tsx`.

---

## 2. Bing Webmaster Tools

1. https://www.bing.com/webmasters → add `https://www.sanctumruntime.com`
2. Verify (meta tag → `VITE_BING_SITE_VERIFICATION` in env, redeploy, same as Google)
3. Submit sitemap: `https://www.sanctumruntime.com/sitemap.xml`
4. Or import from Google Search Console if linked

---

## 3. After deploy checks

```bash
curl -sI https://www.sanctumruntime.com/sitemap.xml | head -5
curl -s https://www.sanctumruntime.com/robots.txt | grep -i sitemap
```

View source on `/` — expect `application/ld+json`, `og:url`, `link rel="canonical"`.

---

## 4. Optional later

- `/public/og.png` (1200×630) + `VITE_OG_IMAGE_URL` for richer link previews (currently `favicon-512.png`)
- `/blog`, `/pricing`, `/changelog` — add routes in `src/lib/seo.ts` and `public/sitemap.xml` when pages exist
- Regenerate sitemap locally: `npm run generate:sitemap` (optional; production uses committed `public/sitemap.xml`)

---

## 5. Entity consistency (manual)

Same name and one-line description on GitHub, LinkedIn, npm — copy from `/llms.txt`.
