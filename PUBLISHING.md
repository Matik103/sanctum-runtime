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

**One-time:** Register a **workers.dev** subdomain (Cloudflare dashboard → **Workers & Pages** → onboarding, or the link Wrangler prints on first deploy). Without this, deploy uploads the worker but cannot assign a public URL.

Push to `main` runs [`.github/workflows/deploy-site.yml`](./.github/workflows/deploy-site.yml), or locally:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run deploy
```
