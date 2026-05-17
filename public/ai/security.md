# Sanctum Runtime — Security

## Threat model (summary)

Sanctum assumes LLMs and agents are untrusted proposers of actions. The runtime is the enforcement point before irreversible side effects.

## Controls

- **Policy fail-closed** — unknown or high-risk actions can require verification or block
- **API authentication** — Supabase JWT (dashboard) or `X-Sanctum-Key` (peppered bcrypt hashes)
- **Rate limiting** — global and per-IP on the API
- **Audit immutability** — verification records with operator resolve trail
- **Webhooks** — signed optional `X-Sanctum-Signature` (HMAC)
- **SSO** — OIDC for enterprise orgs; secrets encrypted with operator-provided key
- **GDPR** — export API for org data portability
- **Attestation** — optional TPM quotes for runtime identity

## Deployment

- API: Render (`api.sanctumruntime.com`)
- Dashboard: static host (`console.sanctumruntime.com`)
- Data: Supabase (Postgres + RLS)

## Open core boundary

MIT SDK and local runtime; advanced intelligence and hosted fleet are enterprise. See OPEN_CORE.md in the repository.
