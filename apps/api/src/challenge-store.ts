import { randomBytes } from 'node:crypto'
import { createSupabaseAdmin, type SupabaseAuthConfig } from './auth.js'

export type AttestationChallenge = {
  id: string
  nonce: string
  org_id: string | null
  expires_at: string
  consumed_at: string | null
}

export class ChallengeStore {
  constructor(private supabase: SupabaseAuthConfig) {}

  private admin() {
    return createSupabaseAdmin(this.supabase)
  }

  async create(orgId?: string, ttlMs = 300_000): Promise<AttestationChallenge> {
    const nonce = randomBytes(24).toString('base64url')
    const expiresAt = new Date(Date.now() + ttlMs).toISOString()
    const { data, error } = await this.admin()
      .from('attestation_challenges')
      .insert({
        nonce,
        org_id: orgId ?? null,
        expires_at: expiresAt,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as AttestationChallenge
  }

  async consume(challengeId: string, nonce: string): Promise<AttestationChallenge | null> {
    const { data, error } = await this.admin()
      .from('attestation_challenges')
      .select('*')
      .eq('id', challengeId)
      .eq('nonce', nonce)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return null
    const row = data as AttestationChallenge
    if (row.consumed_at) return null
    if (new Date(row.expires_at).getTime() < Date.now()) return null

    const { error: updErr } = await this.admin()
      .from('attestation_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challengeId)
      .is('consumed_at', null)
    if (updErr) throw new Error(updErr.message)
    return row
  }
}
