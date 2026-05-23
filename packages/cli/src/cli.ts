#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { SanctumClient } from '@sanctum-runtime/sdk'

const USAGE = `sanctum — Sanctum Runtime CLI

Usage:
  sanctum status
  sanctum verify --actor <id> --action <name> [--context <json>] [--offline]
  sanctum policies export [--out <file.yaml>]

Environment:
  SANCTUM_API_URL   Runtime API base URL (required)
  SANCTUM_API_KEY   X-Sanctum-Key (optional)
`

function parseArgs(argv: string[]) {
  const [cmd, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { cmd, flags, positional }
}

function client(): SanctumClient {
  return new SanctumClient({
    offlineMode: false,
  })
}

async function main() {
  const { cmd, flags, positional } = parseArgs(process.argv.slice(2))

  if (!cmd || cmd === 'help' || flags.help) {
    console.log(USAGE)
    process.exit(0)
  }

  const api = client()

  switch (cmd) {
    case 'status': {
      const s = await api.getStatus()
      console.log(JSON.stringify(s, null, 2))
      break
    }
    case 'verify': {
      const actor = String(flags.actor ?? '')
      const action = String(flags.action ?? '')
      if (!actor || !action) {
        console.error('verify requires --actor and --action')
        process.exit(1)
      }
      let context: Record<string, unknown> = {}
      if (flags.context) {
        context = JSON.parse(String(flags.context)) as Record<string, unknown>
      }
      const result = await api.verifyAction(
        { actor, action, context },
        { offlineMode: Boolean(flags.offline) },
      )
      console.log(JSON.stringify(result, null, 2))
      if (result.decision === 'BLOCKED') process.exit(2)
      if (result.decision === 'REQUIRE_VERIFICATION') process.exit(3)
      break
    }
    case 'policies': {
      if (positional[0] === 'export') {
        const yaml = await api.exportPoliciesYaml()
        const out = flags.out ? String(flags.out) : undefined
        if (out) {
          writeFileSync(out, yaml, 'utf8')
          console.log(`Wrote ${out}`)
        } else {
          console.log(yaml)
        }
        break
      }
      console.error('Unknown policies subcommand. Try: sanctum policies export')
      process.exit(1)
      break
    }
    default:
      console.error(`Unknown command: ${cmd}\n`)
      console.log(USAGE)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
