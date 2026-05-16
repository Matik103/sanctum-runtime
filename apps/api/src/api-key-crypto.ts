import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12
const KEY_PREFIX = 'sk_sanctum_'

export function generateApiKeySecret(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function keyDisplayParts(secret: string): { prefix: string; suffix: string } {
  return {
    prefix: secret.slice(0, 16),
    suffix: secret.slice(-4),
  }
}

function getPepper(): string {
  const pepper = process.env.SANCTUM_API_KEY_PEPPER?.trim()
  if (pepper && pepper.length >= 16) return pepper
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SANCTUM_API_KEY_PEPPER must be set in production (min 16 chars)')
  }
  return 'sanctum-dev-pepper-change-in-production'
}

function pepperedMaterial(secret: string): string {
  return `${getPepper()}\0${secret}`
}

/** OpenAI-style: slow hash + server pepper; never store plaintext. */
export async function hashApiKeyV1(secret: string): Promise<string> {
  return bcrypt.hash(pepperedMaterial(secret), BCRYPT_ROUNDS)
}

export async function verifyApiKeyV1(secret: string, storedHash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pepperedMaterial(secret), storedHash)
  } catch {
    return false
  }
}

/** Legacy rows created before bcrypt_v1. */
export function hashApiKeyLegacy(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function verifyApiKeyLegacy(secret: string, storedHash: string): boolean {
  const computed = hashApiKeyLegacy(secret)
  try {
    return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    return false
  }
}

export async function verifyApiKey(
  secret: string,
  storedHash: string,
  hashVersion: string,
): Promise<boolean> {
  if (!secret.startsWith(KEY_PREFIX)) return false
  if (hashVersion === 'bcrypt_v1') return verifyApiKeyV1(secret, storedHash)
  return verifyApiKeyLegacy(secret, storedHash)
}
