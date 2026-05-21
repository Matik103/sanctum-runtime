import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { ChallengeStore } from './challenge-store.js'
import { createSoftwareSealedQuote } from './hardware-attestation.js'
import { getSupabaseAuthConfig } from './auth.js'
import { ControlPlaneStore } from './control-plane-store.js'
import { resolveOrgScope, type SanctumReq } from './org-scope.js'

export async function registerHardwareAttestationRoutes(app: FastifyInstance) {
  const cfg = getSupabaseAuthConfig()
  if (!cfg) return

  const store = new ControlPlaneStore(cfg)
  const challenges = new ChallengeStore(cfg)

  app.post('/v1/attestation/challenge', async (req, reply) => {
    const body = z
      .object({
        organizationId: z.string().min(1).max(64).optional(),
        ttlSeconds: z.number().min(60).max(900).optional(),
      })
      .parse(req.body ?? {})

    if (body.organizationId) {
      const scope = await resolveOrgScope(req as SanctumReq, store)
      if (scope !== null && !scope.includes(body.organizationId)) {
        return reply.status(403).send({ error: 'org_forbidden' })
      }
    }

    const row = await challenges.create(
      body.organizationId,
      (body.ttlSeconds ?? 300) * 1000,
    )
    const sealed = createSoftwareSealedQuote(row.id, row.nonce)
    return {
      challengeId: row.id,
      nonce: row.nonce,
      expiresAt: row.expires_at,
      /** Reference quote for software-sealed mode (TPM agents supply their own). */
      softwareSealedQuote: sealed.quote,
    }
  })

  app.get('/v1/attestation/challenge', async (req, reply) => {
    const orgId = (req.query as { org_id?: string }).org_id
    if (orgId) {
      const scope = await resolveOrgScope(req as SanctumReq, store)
      if (scope !== null && !scope.includes(orgId)) {
        return reply.status(403).send({ error: 'org_forbidden' })
      }
    }
    const row = await challenges.create(orgId)
    const sealed = createSoftwareSealedQuote(row.id, row.nonce)
    return {
      challengeId: row.id,
      nonce: row.nonce,
      expiresAt: row.expires_at,
      softwareSealedQuote: sealed.quote,
    }
  })
}
