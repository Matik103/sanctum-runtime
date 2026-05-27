#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { SanctumClient } from '@sanctum-runtime/sdk'

const USAGE = `sanctum — Sanctum Runtime CLI

Usage:
  sanctum status
  sanctum verify --actor <id> --action <name> [--context <json>] [--offline]
  sanctum audit [--limit <n>] [--org <id>]
  sanctum policies list
  sanctum policies export [--out <file.yaml>]
  sanctum policies import --file <file.yaml> [--no-merge]
  sanctum agents list --org <id>
  sanctum agents rotate --org <id> --agent <agentId>
  sanctum agents stats --org <id> --agent <agentId>
  sanctum shield rules [--org <id>]
  sanctum shield events [--org <id>] [--limit <n>]
  sanctum webhooks dead [--org <id>]

Exit codes:
  0  Success / action APPROVED
  1  Error / misconfiguration
  2  Action BLOCKED
  3  Action REQUIRE_VERIFICATION

Environment:
  SANCTUM_API_URL   Runtime API base URL (required)
  SANCTUM_API_KEY   X-Sanctum-Key (optional for authenticated routes)
`

function parseArgs(argv: string[]) {
  const [cmd, sub, ...rest] = argv
  const flags: Record<string, string | boolean> = {}
  const positional: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { cmd, sub, flags, positional }
}

function client(): SanctumClient {
  return new SanctumClient({ offlineMode: false })
}

function apiUrl(): string {
  return process.env.SANCTUM_API_URL?.replace(/\/$/, '') ?? ''
}

function apiKey(): string | undefined {
  return process.env.SANCTUM_API_KEY?.trim() || undefined
}

async function apiGet<T>(path: string): Promise<T> {
  const key = apiKey()
  const res = await fetch(`${apiUrl()}${path}`, {
    headers: {
      ...(key ? { 'X-Sanctum-Key': key } : {}),
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => String(res.status))
    throw new Error(`GET ${path} → HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  return res.json() as Promise<T>
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const key = apiKey()
  const res = await fetch(`${apiUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-Sanctum-Key': key } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status))
    throw new Error(`POST ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  return res.json() as Promise<T>
}

function print(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2))
}

function requireFlag(flags: Record<string, string | boolean>, name: string, cmd: string): string {
  const v = flags[name]
  if (!v || typeof v !== 'string') {
    console.error(`${cmd} requires --${name}`)
    process.exit(1)
  }
  return v
}

async function main() {
  const { cmd, sub, flags } = parseArgs(process.argv.slice(2))

  if (!cmd || cmd === 'help' || flags['help']) {
    console.log(USAGE)
    process.exit(0)
  }

  if (!apiUrl() && cmd !== 'help') {
    console.error('SANCTUM_API_URL is not set.\nExport it: export SANCTUM_API_URL=https://your-api.example.com')
    process.exit(1)
  }

  const api = client()

  switch (cmd) {
    // ── status ───────────────────────────────────────────────────────────────
    case 'status': {
      const s = await api.getStatus()
      print(s)
      break
    }

    // ── verify ───────────────────────────────────────────────────────────────
    case 'verify': {
      const actor = requireFlag(flags, 'actor', 'verify')
      const action = requireFlag(flags, 'action', 'verify')
      let context: Record<string, unknown> = {}
      if (flags['context']) {
        context = JSON.parse(String(flags['context'])) as Record<string, unknown>
      }
      const result = await api.verifyAction(
        { actor, action, context },
        { offlineMode: Boolean(flags['offline']) },
      )
      print(result)
      if (result.decision === 'BLOCKED') process.exit(2)
      if (result.decision === 'REQUIRE_VERIFICATION') process.exit(3)
      break
    }

    // ── audit ─────────────────────────────────────────────────────────────────
    case 'audit': {
      const limit = Number(flags['limit'] ?? 50)
      const orgParam = flags['org'] ? `&org_id=${String(flags['org'])}` : ''
      const entries = await apiGet<unknown[]>(`/v1/audit?limit=${limit}${orgParam}`)
      print(entries)
      break
    }

    // ── policies ─────────────────────────────────────────────────────────────
    case 'policies': {
      if (!sub || sub === 'list') {
        const policies = await api.getPolicies()
        print(policies)
        break
      }
      if (sub === 'export') {
        const yaml = await api.exportPoliciesYaml()
        const out = flags['out'] ? String(flags['out']) : undefined
        if (out) {
          writeFileSync(out, yaml, 'utf8')
          console.log(`Wrote ${out}`)
        } else {
          console.log(yaml)
        }
        break
      }
      if (sub === 'import') {
        const file = requireFlag(flags, 'file', 'policies import')
        const yaml = readFileSync(file, 'utf8')
        const merge = flags['no-merge'] !== true
        const result = await api.importPoliciesYaml(yaml, merge)
        print(result)
        break
      }
      console.error(`Unknown policies subcommand: ${sub}`)
      console.error('Try: sanctum policies list | export | import')
      process.exit(1)
      break
    }

    // ── agents ────────────────────────────────────────────────────────────────
    case 'agents': {
      const orgId = requireFlag(flags, 'org', `agents ${sub}`)

      if (!sub || sub === 'list') {
        const agents = await apiGet<unknown>(`/v1/runtimes/agents?org_id=${orgId}`)
        print(agents)
        break
      }
      if (sub === 'rotate') {
        const agentId = requireFlag(flags, 'agent', 'agents rotate')
        const result = await apiPost<unknown>(`/v1/orgs/${orgId}/agents/${agentId}/rotate`, {})
        print(result)
        console.error('\n⚠  Token rotated. Update SANCTUM_AGENT_TOKEN in your agent environment immediately.')
        break
      }
      if (sub === 'stats') {
        const agentId = requireFlag(flags, 'agent', 'agents stats')
        const stats = await apiGet<unknown>(`/v1/orgs/${orgId}/agents/${agentId}/stats`)
        print(stats)
        break
      }
      console.error(`Unknown agents subcommand: ${sub}`)
      console.error('Try: sanctum agents list | rotate | stats')
      process.exit(1)
      break
    }

    // ── shield ────────────────────────────────────────────────────────────────
    case 'shield': {
      const orgParam = flags['org'] ? `?org_id=${String(flags['org'])}` : ''

      if (!sub || sub === 'rules') {
        const rules = await apiGet<unknown>(`/v1/shield/rules${orgParam}`)
        print(rules)
        break
      }
      if (sub === 'events') {
        const limit = Number(flags['limit'] ?? 50)
        const sep = orgParam ? '&' : '?'
        const events = await apiGet<unknown>(`/v1/shield/containment${orgParam}${orgParam ? sep : '?'}limit=${limit}`)
        print(events)
        break
      }
      console.error(`Unknown shield subcommand: ${sub}`)
      console.error('Try: sanctum shield rules | events')
      process.exit(1)
      break
    }

    // ── webhooks ──────────────────────────────────────────────────────────────
    case 'webhooks': {
      if (!sub || sub === 'dead') {
        const orgParam = flags['org'] ? `?org_id=${String(flags['org'])}` : ''
        const result = await apiGet<{ dead: unknown[]; count: number }>(`/v1/webhooks/dead${orgParam}`)
        if (result.count === 0) {
          console.log('No permanently-failed webhooks. ✓')
        } else {
          console.warn(`${result.count} permanently-failed webhook(s):`)
          print(result.dead)
        }
        break
      }
      if (sub === 'status') {
        const s = await apiGet<unknown>('/v1/webhooks/status')
        print(s)
        break
      }
      console.error(`Unknown webhooks subcommand: ${sub}`)
      console.error('Try: sanctum webhooks dead | status')
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
