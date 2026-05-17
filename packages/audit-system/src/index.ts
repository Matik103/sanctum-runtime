import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AuditEntry } from '@sanctum-runtime/sdk'

export type AuditStoreOptions = {
  dataDir?: string
}

export class AuditStore {
  private entries: AuditEntry[] = []
  private readonly logPath: string

  constructor(options: AuditStoreOptions = {}) {
    const dataDir = options.dataDir ?? join(process.cwd(), 'data')
    this.logPath = join(dataDir, 'audit.jsonl')
  }

  async append(entry: AuditEntry): Promise<void> {
    this.entries.unshift(entry)
    if (this.entries.length > 500) {
      console.warn('[sanctum] Audit in-memory cap reached (500). Oldest entries are being dropped. Consider enabling Supabase for persistent audit storage.')
      this.entries = this.entries.slice(0, 500)
    }
    await mkdir(dirname(this.logPath), { recursive: true })
    await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  list(limit = 50): AuditEntry[] {
    return this.entries.slice(0, limit)
  }

  count(): number {
    return this.entries.length
  }

  getById(id: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === id)
  }

  findLatestByCorrelationId(correlationId: string): AuditEntry | undefined {
    return this.entries.find((e) => e.correlationId === correlationId)
  }

  listByOrg(orgId: string, limit = 50): AuditEntry[] {
    return this.entries
      .filter((e) => {
        const ctx = e.context as Record<string, unknown>
        return ctx?.org_id === orgId || ctx?.orgId === orgId
      })
      .slice(0, limit)
  }

  async updateEntry(id: string, patch: Partial<AuditEntry>): Promise<AuditEntry | null> {
    const idx = this.entries.findIndex((e) => e.id === id)
    if (idx < 0) return null
    this.entries[idx] = { ...this.entries[idx], ...patch }
    await this.persist()
    return this.entries[idx]
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.logPath), { recursive: true })
    const lines = [...this.entries].reverse().map((e) => JSON.stringify(e))
    const body = lines.length ? `${lines.join('\n')}\n` : ''
    await writeFile(this.logPath, body, 'utf8')
  }

  async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.logPath, 'utf8')
      const lines = raw.trim().split('\n').filter(Boolean)
      this.entries = lines
        .map((line) => JSON.parse(line) as AuditEntry)
        .reverse()
        .slice(0, 500)
    } catch {
      this.entries = []
    }
  }

  /** Merge cloud rows (newer wins per id); keeps newest-first order. */
  hydrate(entries: AuditEntry[], maxEntries = 500): void {
    const byId = new Map<string, AuditEntry>()
    for (const e of this.entries) byId.set(e.id, e)
    for (const e of entries) byId.set(e.id, e)
    this.entries = [...byId.values()]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, maxEntries)
  }
}
