import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import type { SanctumClient } from './client.js'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

export type AgentMemoryVaultOptions = {
  /** Passphrase or raw key material; never sent to the server. */
  encryptionKey: string
  /** Optional salt scope (defaults to org + agent). */
  salt?: string
}

function deriveKey(passphrase: string, salt: string): Buffer {
  return scryptSync(passphrase, salt, 32)
}

export function memoryKeyHint(encryptionKey: string): string {
  return createHash('sha256').update(encryptionKey).digest('hex').slice(0, 16)
}

function encryptJson(key: Buffer, value: unknown): { ciphertext: string; iv: string } {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const plain = Buffer.from(JSON.stringify(value), 'utf8')
  const enc = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const packed = Buffer.concat([enc, tag])
  return {
    ciphertext: packed.toString('base64url'),
    iv: iv.toString('base64url'),
  }
}

function decryptJson(key: Buffer, ciphertext: string, iv: string): unknown {
  const packed = Buffer.from(ciphertext, 'base64url')
  const tag = packed.subarray(packed.length - 16)
  const enc = packed.subarray(0, packed.length - 16)
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(enc), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as unknown
}

export class AgentMemoryVault {
  private readonly key: Buffer
  private readonly hint: string

  constructor(
    private client: SanctumClient,
    private runtimeId: string,
    private agentId: string,
    options: AgentMemoryVaultOptions,
  ) {
    const salt = options.salt ?? `sanctum-memory:${agentId}`
    this.key = deriveKey(options.encryptionKey, salt)
    this.hint = memoryKeyHint(options.encryptionKey)
  }

  get keyHint(): string {
    return this.hint
  }

  private path(memoryKey: string) {
    return `/v1/runtimes/${this.runtimeId}/agents/${encodeURIComponent(this.agentId)}/memory/${encodeURIComponent(memoryKey)}`
  }

  async list(): Promise<{ memoryKey: string; keyHint: string | null; updatedAt: string }[]> {
    const res = await this.client.request<{ keys: { memoryKey: string; keyHint: string | null; updatedAt: string }[] }>(
      'GET',
      `/v1/runtimes/${this.runtimeId}/agents/${encodeURIComponent(this.agentId)}/memory`,
    )
    return res.keys
  }

  async set(memoryKey: string, value: unknown): Promise<void> {
    const { ciphertext, iv } = encryptJson(this.key, value)
    await this.client.request('PUT', this.path(memoryKey), {
      ciphertext,
      iv,
      algorithm: ALGO,
      keyHint: this.hint,
    })
  }

  async get<T = unknown>(memoryKey: string): Promise<T | null> {
    try {
      const row = await this.client.request<{
        ciphertext: string
        iv: string
        keyHint?: string | null
      }>('GET', this.path(memoryKey))
      if (row.keyHint && row.keyHint !== this.hint) {
        throw new Error('memory_key_mismatch: wrong SANCTUM_MEMORY_KEY for this entry')
      }
      return decryptJson(this.key, row.ciphertext, row.iv) as T
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('404')) return null
      throw e
    }
  }

  async delete(memoryKey: string): Promise<void> {
    await this.client.request('DELETE', this.path(memoryKey))
  }
}

/** Resolve encryption key from env (never log or transmit). */
export function resolveMemoryKey(explicit?: string): string {
  const key =
    explicit?.trim() ||
    (typeof process !== 'undefined' ? process.env.SANCTUM_MEMORY_KEY?.trim() : undefined)
  if (!key || key.length < 16) {
    throw new Error(
      'Agent memory requires SANCTUM_MEMORY_KEY (≥16 chars) or encryptionKey in options',
    )
  }
  return key
}
