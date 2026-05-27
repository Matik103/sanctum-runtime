# Marketing & discoverability playbook (10/10 target)

Single checklist for **Google**, **AI search**, **GitHub**, and **npm**.

## Canonical URLs

| Surface | URL |
|---------|-----|
| Marketing | https://www.sanctumruntime.com |
| Blog | https://www.sanctumruntime.com/blog |
| Docs | https://www.sanctumruntime.com/docs |
| Enterprise | https://www.sanctumruntime.com/enterprise |
| SDK page | https://www.sanctumruntime.com/sdk |
| Console | https://console.sanctumruntime.com (noindex) |
| GitHub | https://github.com/Matik103/sanctum-runtime |
| npm | https://www.npmjs.com/package/@sanctum-runtime/sdk |
| llms.txt | https://www.sanctumruntime.com/llms.txt |
| OG image | https://www.sanctumruntime.com/og.png |

## Google Search Console

1. Property: **`https://www.sanctumruntime.com`** (not apex-only, not console).
2. Sitemaps: `sitemap-index.xml` + `sitemap.xml`.
3. Ignore console “Excluded by noindex” — correct.
4. Apex `sanctumruntime.com` → 308 to www (see `vercel.json`).
5. Set `VITE_GOOGLE_SITE_VERIFICATION` on Vercel, redeploy.

## AI crawlers

- `llms.txt` + `/ai/*.md` + **blog posts** linked in footer.
- `robots.txt` allows major AI bots on www; blocks console.
- Entity consistency: same one-liner on GitHub, npm, LinkedIn, site hero.

## GitHub (manual once)

- [ ] Social preview image 1280×640 uploaded.
- [ ] Website field: `https://www.sanctumruntime.com`.
- [ ] Enable Discussions.
- [ ] 20 topics (see `.github/GITHUB_DISCOVERY.md`).
- [ ] Pin a `good first issue`.
- [ ] One launch post → HN / dev.to with link to blog.

## npm

```bash
npm run publish:sdk   # after version bump — homepage → www/sdk
```

## After each marketing deploy

**Production host:** `www.sanctumruntime.com` DNS → **Vercel** (`vercel.json` + `npm run build:vercel`). GitHub `deploy-site.yml` must deploy Vercel (not only Cloudflare).

GitHub secrets for CI deploy: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (from `npx vercel link` → `.vercel/project.json`). Or redeploy manually in the Vercel dashboard.

```bash
npm run generate:sitemap
npm run build:vercel
```

Verify:

```bash
curl -sI https://www.sanctumruntime.com/og.png | head -3
curl -s https://www.sanctumruntime.com/llms.txt | head -20
```

## Positioning (do not dilute)

**Runtime trust infrastructure for autonomous agent fleets** — detect, contain, gate, and prove execution. Not chat moderation. Not a log. The decision layer.

**One-liner (GitHub About, npm description, social):**
> The runtime trust boundary for autonomous AI agents — behavioral detection, signed action tokens, fleet management, SOC2 evidence. MIT.

**Key differentiators to lead with:**
1. **Proactive** — Shield detects threats before execution, not after
2. **Fleet-native** — per-agent threat intelligence, token lifecycle, time-bounded grants
3. **Zero-install** — any agent connects via HTTP; mobile operators approve from their phone
4. **MIT + self-hostable** — no vendor lock-in; runs in Docker or on Render in minutes
5. **Physical world** — same API for robots, smart home, industrial as for software agents

**What we are NOT** (don't let copy drift here):
- Not a chat guardrail (we gate execution, not text)
- Not a log aggregator (we gate *before* the side effect, not after)
- Not agents-only (12 categories, same API)
- Not cloud-only (self-host, local LLM, air-gap friendly)

## Blog cadence (recommended)

- Week 1–2: 5 seed posts (shipped in repo).
- Week 3+: 1 post/week targeting long-tail (MCP, ROS2, SOC2, fleet kill switch, Shield behavioral detection, token rotation, zero-install agents).
- Cross-link every post to docs + one other post.
- New priority topics: **agent fleet security**, **token rotation for AI agents**, **behavioral detection without LLM**, **zero-install agent control plane**.

See [BLOG.md](./BLOG.md).
