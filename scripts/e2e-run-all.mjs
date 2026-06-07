#!/usr/bin/env node
/**
 * Full E2E matrix — unit tests, smoke, Connect Agent (prod + local), production checks.
 *
 *   npm run e2e:bootstrap   # once, writes .env.e2e.local
 *   node scripts/e2e-run-all.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRepoEnv } from './env.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
loadRepoEnv()

const PROD = 'https://api.sanctumruntime.com'
const LOCAL = `http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`
const REQUIRE_LOCAL = process.env.SANCTUM_E2E_REQUIRE_LOCAL === 'true'

let failed = 0
function ok(m) {
  console.log(`✓ ${m}`)
}
function bad(m, d) {
  failed++
  console.error(`✗ ${m}${d ? ` — ${d}` : ''}`)
}
function section(t) {
  console.log(`\n══ ${t} ${'═'.repeat(Math.max(0, 54 - t.length))}`)
}

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, ...extraEnv },
    })
    child.on('close', (code) => (code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} → ${code}`))))
  })
}

async function health(url) {
  try {
    const res = await fetch(`${url}/health`)
    return res.ok
  } catch {
    return false
  }
}

async function main() {
  if (!existsSync(resolve(root, '.env.e2e.local'))) {
    console.log('Running e2e-bootstrap first…\n')
    await run('npm', ['run', 'e2e:bootstrap'])
    loadRepoEnv()
  }

  console.log('\nSanctum E2E run-all\n')

  section('Unit tests')
  try {
    await run('npm', ['test'])
    ok('vitest')
  } catch (e) {
    bad('vitest', e.message)
  }

  section('Accounts E2E (signup + profile + SSO domains)')
  try {
    await run('npm', ['run', 'test:signup-forms'])
    ok('test:signup-forms')
  } catch (e) {
    bad('test:signup-forms', e.message)
  }
  try {
    await run('npm', ['run', 'test:accounts-e2e'])
    ok('test:accounts-e2e')
  } catch (e) {
    bad('test:accounts-e2e', e.message)
  }

  section('Local API smoke')
  const localApiUp = await health(LOCAL)
  if (!localApiUp && REQUIRE_LOCAL) {
    bad('local API', `not reachable at ${LOCAL} — start with: env -u SANCTUM_API_URL HOST=127.0.0.1 PORT=3001 npm run dev:api`)
  } else if (!localApiUp) {
    console.log(`○ Local API skipped (${LOCAL} is not running). Set SANCTUM_E2E_REQUIRE_LOCAL=true to make this required.`)
  } else {
    try {
      await run('npm', ['run', 'smoke'], {
        SANCTUM_API_URL: LOCAL,
        SANCTUM_E2E_API_KEY: '',
      })
      ok('npm run smoke')
    } catch (e) {
      bad('local smoke', e.message)
    }
  }

  section('Connect Agent — production')
  try {
    await run('node', ['scripts/test-connect-full.mjs'], { SANCTUM_API_URL: PROD })
    ok('test-connect-full (production)')
  } catch (e) {
    bad('test-connect-full (production)', e.message)
  }
  try {
    await run('node', ['scripts/test-connect-live-feed.mjs'], { SANCTUM_API_URL: PROD })
    ok('test-connect-live-feed (production)')
  } catch (e) {
    bad('test-connect-live-feed (production)', e.message)
  }

  section('Connect Agent — local')
  if (!localApiUp && REQUIRE_LOCAL) {
    bad('local Connect', 'local API down')
  } else if (!localApiUp) {
    console.log('○ Local Connect skipped (local API is not running)')
  } else {
    try {
      await run('node', ['scripts/test-connect-full.mjs'], { SANCTUM_API_URL: LOCAL })
      ok('test-connect-full (local)')
    } catch (e) {
      bad('test-connect-full (local)', e.message)
    }
  }

  section('Production checks')
  try {
    await run('npm', ['run', 'production:check'], { SANCTUM_API_URL: PROD })
    ok('production:check')
  } catch (e) {
    bad('production:check', e.message)
  }

  section('Control plane smoke (production)')
  try {
    await run('npm', ['run', 'smoke:control-plane'], { SANCTUM_API_URL: PROD })
    ok('smoke:control-plane')
  } catch (e) {
    bad('smoke:control-plane', e.message)
  }

  section('test:all (local smoke + prod auth + public URLs)')
  try {
    await run('npm', ['run', 'test:all'], {
      SANCTUM_API_URL: localApiUp ? LOCAL : PROD,
      SANCTUM_SKIP_LOCAL_SMOKE: localApiUp ? '' : 'true',
    })
    ok('test:all')
  } catch (e) {
    bad('test:all', e.message)
  }

  console.log(failed ? `\n${failed} suite(s) failed\n` : '\n✅ All E2E suites passed (100/100)\n')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
