import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AuditEntry } from '@sanctum-runtime/sdk'

export type AuditStoreOptions = {
  dataDir?: string
  /** Maximum entries kept in memory. Oldest are evicted past this cap. */
  maxEntries?: number
  /** Disk file size threshold (bytes) — rotates `audit.jsonl` → `audit.jsonl.1` when exceeded. */
  maxDiskBytes?: number
}

const DEFAULT_MAX_ENTRIES =
  Number.parseInt(process.env.SANCTUM_AUDIT_CAP ?? '', 10) > 0
    ? Number.parseInt(process.env.SANCTUM_AUDIT_CAP!, 10)
    : 500

const DEFAULT_MAX_DISK_BYTES =
  Number.parseInt(process.env.SANCTUM_AUDIT_DISK_BYTES ?? '', 10) > 0
    ? Number.parseInt(process.env.SANCTUM_AUDIT_DISK_BYTES!, 10)
    : 32 * 1024 * 1024  // 32 MiB

const EVICTION_LOG_INTERVAL_MS = 60_000

export class AuditStore {
  private entries: AuditEntry[] = []
  private readonly logPath: string
  private readonly maxEntries: number
  private readonly maxDiskBytes: number

  // Eviction observability — counters are read by /metrics
  private evictionTotal = 0
  private lastEvictionLogAt = 0
  private evictionsSinceLastLog = 0

  constructor(options: AuditStoreOptions = {}) {
    const dataDir = options.dataDir ?? join(process.cwd(), 'data')
    this.logPath = join(dataDir, 'audit.jsonl')
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.maxDiskBytes = options.maxDiskBytes ?? DEFAULT_MAX_DISK_BYTES
  }

  async append(entry: AuditEntry): Promise<void> {
    this.entries.unshift(entry)
    if (this.entries.length > this.maxEntries) {
      const dropped = this.entries.length - this.maxEntries
      this.entries = this.entries.slice(0, this.maxEntries)
      this.recordEvictions(dropped)
    }
    await mkdir(dirname(this.logPath), { recursive: true })
    await this.rotateIfNeeded()
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

  /**
   * Eviction stats for /metrics. `total` is the running counter since boot;
   * a non-zero `total` with a steady rate indicates the in-memory cap is too
   * low for the workload (or Supabase is unavailable as durable storage).
   */
  getEvictionStats(): { total: number; cap: number; current: number } {
    return { total: this.evictionTotal, cap: this.maxEntries, current: this.entries.length }
  }

  private recordEvictions(count: number): void {
    this.evictionTotal += count
    this.evictionsSinceLastLog += count
    const now = Date.now()
    if (now - this.lastEvictionLogAt >= EVICTION_LOG_INTERVAL_MS) {
      // Structured throttled log — once per minute regardless of append rate.
      // Use console.warn so it flows through whatever logger pipeline the host
      // process has configured (Fastify pino, Render's stdout collector, etc).
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'audit_evictions',
        droppedSinceLastLog: this.evictionsSinceLastLog,
        evictionTotal: this.evictionTotal,
        cap: this.maxEntries,
        hint: 'in-memory audit cap reached; enable Supabase for durable storage or raise SANCTUM_AUDIT_CAP',
      }))
      this.lastEvictionLogAt = now
      this.evictionsSinceLastLog = 0
    }
  }

  /**
   * Rotates `audit.jsonl` → `audit.jsonl.1` when the file exceeds maxDiskBytes.
   * Single-generation rotation: the previous `.1` is overwritten. This keeps
   * disk usage bounded at ~2× maxDiskBytes without needing a cleanup job.
   * Failures here are non-fatal — the in-memory store remains authoritative.
   */
  private async rotateIfNeeded(): Promise<void> {
    try {
      const info = await stat(this.logPath)
      if (info.size < this.maxDiskBytes) return
      await rename(this.logPath, `${this.logPath}.1`)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        // Don't crash on rotation errors — just log and carry on.
        console.warn(JSON.stringify({
          level: 'warn',
          event: 'audit_rotation_failed',
          message: (err as Error).message,
        }))
      }
    }
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
        .slice(0, this.maxEntries)
    } catch {
      this.entries = []
    }
  }

  /** Merge cloud rows (newer wins per id); keeps newest-first order. */
  hydrate(entries: AuditEntry[], maxEntries?: number): void {
    const cap = maxEntries ?? this.maxEntries
    const byId = new Map<string, AuditEntry>()
    for (const e of this.entries) byId.set(e.id, e)
    for (const e of entries) byId.set(e.id, e)
    this.entries = [...byId.values()]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, cap)
  }
}
