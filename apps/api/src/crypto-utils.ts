import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto'

import { logger as rootLogger } from './logger.js'

const log = rootLogger.child({ module: 'crypto-utils' })

const SCHEME_PREFIX = 'enc:v1:'
const KEY_SALT = 'sanctum-aes-v1'
const KEY_LEN = 32 // AES-256
const IV_LEN = 12 // GCM recommended IV
const TAG_LEN = 16 // GCM auth tag

/**
 * Derives a 32-byte AES key from a master key string using scrypt.
 * Uses a fixed salt so the same masterKey always yields the same AES key.
 */
function deriveKey(masterKey: string): Buffer {
  return scryptSync(masterKey, KEY_SALT, KEY_LEN) as Buffer
}

/**
 * Encrypts `plaintext` with AES-256-GCM using a key derived from `masterKey`.
 *
 * Output format: `enc:v1:<iv_hex>:<ciphertext_base64>:<auth_tag_hex>`
 */
export async function encryptSecret(
  plaintext: string,
  masterKey: string,
): Promise<string> {
  const key = deriveKey(masterKey)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    'enc:v1',
    iv.toString('hex'),
    encrypted.toString('base64'),
    authTag.toString('hex'),
  ].join(':')
}

/**
 * Decrypts a ciphertext produced by `encryptSecret`.
 * Throws if the format is invalid or authentication fails.
 */
export async function decryptSecret(
  ciphertext: string,
  masterKey: string,
): Promise<string> {
  if (!ciphertext.startsWith(SCHEME_PREFIX)) {
    throw new Error('unsupported_ciphertext_scheme')
  }

  // Format: enc:v1:<iv_hex>:<ciphertext_base64>:<auth_tag_hex>
  // Split on ':' but limit to 5 parts to handle base64 with padding (no ':' in base64, but be safe)
  const rest = ciphertext.slice(SCHEME_PREFIX.length) // iv_hex:ciphertext_base64:auth_tag_hex
  const firstColon = rest.indexOf(':')
  const lastColon = rest.lastIndexOf(':')
  if (firstColon === -1 || lastColon === -1 || firstColon === lastColon) {
    throw new Error('invalid_ciphertext_format')
  }

  const ivHex = rest.slice(0, firstColon)
  const authTagHex = rest.slice(lastColon + 1)
  const ciphertextB64 = rest.slice(firstColon + 1, lastColon)

  const key = deriveKey(masterKey)
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(ciphertextB64, 'base64')
  const authTag = Buffer.from(authTagHex, 'hex')

  if (iv.length !== IV_LEN) throw new Error('invalid_iv_length')
  if (authTag.length !== TAG_LEN) throw new Error('invalid_auth_tag_length')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

/**
 * Returns the encryption master key from the environment.
 *
 * - Prefers `SSO_ENCRYPTION_KEY` (set this in production)
 * - Falls back to `SUPABASE_SERVICE_ROLE_KEY` in development
 * - Throws if neither is set and `NODE_ENV === 'production'`
 */
export function getEncryptionKey(): string {
  const explicit = process.env.SSO_ENCRYPTION_KEY?.trim()
  if (explicit) return explicit

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (serviceKey) {
    if (process.env.NODE_ENV === 'production') {
      // Warn but still allow fallback so existing deployments don't break immediately
      log.warn('dedicated SSO encryption key is not configured')
    }
    return serviceKey
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SSO_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY as fallback) must be set in production',
    )
  }

  // Local dev: deterministic insecure key
  return 'dev-key-change-in-production-1234'
}
