# Publishing (maintainers)

One-time setup, then releases are automated.

## 1. npm — `@sanctum/runtime`

Create an npm account and the **`@sanctum`** organization (or use your user scope and adjust the package name).

```bash
npm login
cd packages/sdk
npm publish --access public
```

**CI (recommended):** Add repo secret `NPM_TOKEN` (Automation token with publish). Pushing a GitHub Release runs [`.github/workflows/release.yml`](./.github/workflows/release.yml).

Verify:

```bash
npm view @sanctum/runtime version
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

Push to `main` runs [`.github/workflows/deploy-site.yml`](./.github/workflows/deploy-site.yml), or locally:

```bash
export CLOUDFLARE_API_TOKEN=...
npm run deploy
```
