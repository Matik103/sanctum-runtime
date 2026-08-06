# Publishing (maintainers)

One-time setup, then releases are automated.

## 1. npm — `@sanctum-runtime/sdk` and `@sanctum-runtime/adapter-agent-runtime`

Create an npm organization (the name **`sanctum`** is taken on npm):

1. Open [npm → Create Organization](https://www.npmjs.com/org/create)
2. Name: **`sanctum-runtime`** (matches this GitHub repo; scope `@sanctum-runtime`)
3. Add your user (`matik103`) as owner
4. Recreate `NPM_TOKEN` with publish access to the **sanctum-runtime** org

Published packages:

- **`@sanctum-runtime/sdk`** — `npm install @sanctum-runtime/sdk`
- **`@sanctum-runtime/adapter-agent-runtime`** — `protectAgent()`, `AgentActions`

If publish fails with `404 Not Found`, the org does not exist yet or the token lacks scope access.

```bash
npm login
npm run build:packages
npm publish -w @sanctum-runtime/sdk --access public
npm publish -w @sanctum-runtime/adapter-agent-runtime --access public
```

**CI (recommended):** Add repo secret `NPM_TOKEN` (granular or automation token with **publish** permission).

**2FA / OTP:** If npm publish fails with `EOTP`, recreate the token and enable **“Bypass two-factor authentication for automation”** on the granular token (npm → Access Tokens → generate new). CI cannot type an OTP code.

Pushing a GitHub Release runs [`.github/workflows/release.yml`](./.github/workflows/release.yml).

Verify:

```bash
npm view @sanctum-runtime/sdk version
npm view @sanctum-runtime/adapter-agent-runtime version
```

### Why GitHub says “No packages published”

That sidebar means **GitHub Packages** (packages hosted *on* GitHub), not “nothing on npm.”

Your SDK **is on the public npm registry** (`@sanctum-runtime/sdk@0.1.0`) — developers install with:

```bash
npm install @sanctum-runtime/sdk
```

To show packages in the repo **Packages** box, link npm to GitHub (one-time per package):

1. Open [npmjs.com/package/@sanctum-runtime/sdk](https://www.npmjs.com/package/@sanctum-runtime/sdk) → **Settings** (if you own the org)
2. **Repository** / **Repository link** → `Matik103/sanctum-runtime`
3. Repeat for `@sanctum-runtime/adapter-agent-runtime`

Or publish via the [Release workflow](./.github/workflows/release.yml) with `NPM_TOKEN` and **provenance** (already configured) after linking the org on npm.

**Releases** (v0.1.0) are separate: source tags on GitHub. **npm** is where the installable SDK lives.

## 2. GitHub Release

```bash
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md
```

## 3. Marketing site (Cloudflare)

Add repo secrets:

- `CLOUDFLARE_API_TOKEN` — Workers deploy
- `CLOUDFLARE_ACCOUNT_ID` — from Cloudflare dashboard

**Cloudflare Workers → Build (Git):** this repo uses **npm** (`package-lock.json`), not Bun. If you connect Git in the dashboard, set:

| Setting | Value |
|---------|--------|
| Build command | `npm run cf:build` (or `npm run build`) |
| Deploy command | `npm run cf:deploy` (or `npx wrangler deploy` after build — uses generated `wrangler.json`) |
| Root directory | `/` |

Click **Update**, then **Retry build** on the latest `main` commit (after `bun.lock` was removed).

Cloudflare already installs dependencies before the build command. If you intentionally set `SKIP_DEPENDENCY_INSTALL=true`, use `npm run cf:ci-build` instead; it runs `npm ci --no-audit --no-fund` before building. The deploy command is explicit about `dist/server/wrangler.json`, which Nitro generates during the build.

Do **not** keep `bun.lock` in the repo — Cloudflare auto-runs `bun install --frozen-lockfile` when it exists and the build will fail if it is out of sync.

**One-time:** Register a **workers.dev** subdomain (Cloudflare dashboard → **Workers & Pages** → onboarding, or the link Wrangler prints on first deploy). Without this, deploy uploads the worker but cannot assign a public URL.

Push to `main` runs [`.github/workflows/deploy-site.yml`](./.github/workflows/deploy-site.yml), or locally:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run deploy
```
