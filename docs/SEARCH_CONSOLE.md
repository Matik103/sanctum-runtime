# Search Console & Bing Webmaster

Marketing site: **https://www.sanctumruntime.com** (canonical — not the bare apex)

## HTTPS / “HTTPS not evaluated” (Google Page Experience)

If Search Console flags **`https://sanctumruntime.com/`** (no `www`):

- That host only **redirects** to `https://www.sanctumruntime.com/` — Google may report “HTTPS not evaluated” on the redirect URL itself. That is expected.
- **Fix in GSC:** Use property **`https://www.sanctumruntime.com`** as primary (matches sitemap + canonicals).
- **Fix in Vercel:** `vercel.json` sends **308** apex → www + HSTS; redeploy marketing site after merge.
- After deploy: **URL inspection** → `https://sanctumruntime.com/` → should show redirect to www over HTTPS → **Validate fix** on the HTTPS report.

Do **not** submit `https://sanctumruntime.com/` as the homepage in sitemap (already uses `www` only).

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

## Console: “Excluded by noindex tag” (expected — not a bug)

If Page indexing lists **`https://console.sanctumruntime.com/`** as excluded by **noindex**:

- **This is correct.** The operator console is private (login, fleet, policies). It must **not** appear in Google search results.
- We set `noindex` on purpose: `apps/dashboard/index.html`, `robots.txt` (`Disallow: /`), `X-Robots-Tag` in `render.yaml` / `_headers`.
- **Do not** click **Validate fix** on that row — that tells Google you removed `noindex`, which you should not do.
- **Do not** remove `noindex` from the dashboard to “fix” Search Console.

**What to do instead**

1. Use a GSC property scoped to **`https://www.sanctumruntime.com`** (URL prefix), not a **Domain** property that sweeps `console.*` into the same reports.
2. Ignore the console URL under **Excluded** — it is working as designed.
3. Optional: **Removals** → temporary removal of `https://console.sanctumruntime.com/` only if a preview URL was accidentally indexed (rare).

Indexable marketing content: **https://www.sanctumruntime.com** (sitemap, docs, legal pages).

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
