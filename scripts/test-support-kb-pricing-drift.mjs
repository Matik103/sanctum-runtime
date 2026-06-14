#!/usr/bin/env node
/**
 * CI gate: pricing.tsx and sync-support-kb.ts must agree on Observer observe-only.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const pricingTsx = readFileSync(resolve(root, 'src/routes/pricing.tsx'), 'utf8')
const syncKb = readFileSync(resolve(root, 'scripts/sync-support-kb.ts'), 'utf8')

const checks = [
  {
    name: 'Observer governed actions none (pricing page)',
    ok: /Governed actions[\s\S]*?value:\s*"None"/i.test(pricingTsx),
  },
  {
    name: 'Observer observe-only (pricing page)',
    ok: /observe only/i.test(pricingTsx),
  },
  {
    name: 'Observer no governed actions (KB sync)',
    ok: /Governed actions:\s*none\s*\(observe only/i.test(syncKb),
  },
  {
    name: 'Observer $0 free (KB sync)',
    ok: /\$0.*free forever/i.test(syncKb),
  },
  {
    name: 'No stale 50/mo on Observer in KB sync',
    ok: !/Observer[\s\S]{0,400}50\/mo/i.test(syncKb),
  },
]

let failed = 0
for (const c of checks) {
  if (c.ok) {
    console.log(`✓ ${c.name}`)
  } else {
    console.error(`✗ ${c.name}`)
    failed++
  }
}

if (failed) process.exit(1)
console.log('Pricing KB drift check passed.')
