#!/usr/bin/env node
/**
 * Accounts E2E: signup triggers + API profile/domains + operator context.
 *
 * Usage: npm run test:accounts-e2e
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional: SANCTUM_API_URL (default https://api.sanctumruntime.com)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const API = (process.env.SANCTUM_API_URL || process.env.SANCTUM_PUBLIC_API_URL || 'https://api.sanctumruntime.com').replace(
  /\/$/,
  '',
)

const pass = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg, detail) => {
  console.error(`  ✗ ${msg}`, detail ?? '')
  process.exit(1)
}

function isProfileComplete(json) {
  if (json.complete === true) return true
  if (json.complete === false) return false
  return (
    (json.display_name?.trim().length ?? 0) >= 2 &&
    Boolean(json.country_code) &&
    Boolean(json.accepted_terms_at)
  )
}

const ts = Date.now()

async function apiFetch(path, { method = 'GET', jwt, body } = {}) {
  const hasBody = body !== undefined
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  })
  let json = null
  const text = await res.text()
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { res, json }
}

async function signUpAndSignIn(auth, admin, email, password, metadata) {
  const { error: upErr } = await auth.auth.signUp({ email, password, options: { data: metadata } })
  if (upErr) fail(`signUp ${email}`, upErr.message)
  const { data: signIn, error: inErr } = await auth.auth.signInWithPassword({ email, password })
  if (inErr) fail(`signIn ${email}`, inErr.message)
  const jwt = signIn.session?.access_token
  const userId = signIn.user?.id
  if (!jwt || !userId) fail(`session ${email}`, 'no jwt')
  return { jwt, userId }
}

async function waitForProfile(admin, userId) {
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from('profiles').select('id, country_code, display_name').eq('id', userId).maybeSingle()
    if (data) return data
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !serviceKey || !anonKey) {
    fail('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY')
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const createdUserIds = []
  const testDomain = `e2e-${ts}.example`

  console.log(`\nAccounts E2E → Supabase + ${API}\n`)

  // API reachable and new routes deployed
  const health = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null)
  const apiCommit = health?.version?.commit ?? 'unknown'
  if (!health?.ok && health?.status !== 'ok') {
    console.warn('  ⚠ API health check inconclusive', health)
  } else {
    pass(`API health (commit ${apiCommit})`)
  }

  const probe = await apiFetch('/v1/account/profile')
  if (probe.res.status === 404) {
    fail('API routes', 'GET /v1/account/profile returns 404 — deploy latest API first')
  }
  if (probe.res.status !== 401) {
    fail('API auth', `expected 401 without JWT, got ${probe.res.status}`)
  }
  pass('account profile route exists (auth required)')

  const domainsProbe = await apiFetch('/v1/orgs/probe-org/domains')
  const hasDomainsApi = domainsProbe.res.status === 401 || domainsProbe.res.status === 403
  if (!hasDomainsApi) {
    console.warn('  ⚠ Domains API not on this deployment — skipping SSO domain tests')
  }

  const indEmail = `acct-ind-${ts}@sanctum-e2e.test`
  const orgEmail = `acct-org-${ts}@sanctum-e2e.test`
  const incompleteEmail = `acct-incomplete-${ts}@sanctum-e2e.test`

  try {
    // ─── 1. Individual signup + profile API ───
    console.log('\n1. Individual account')
    const indMeta = {
      signup_type: 'individual',
      portal_type: 'operator',
      signup_source: 'dashboard',
      auth_provider: 'email',
      display_name: 'E2E Individual',
      country_code: 'US',
      terms_accepted_at: new Date().toISOString(),
      terms_version: '2025-05',
    }
    const ind = await signUpAndSignIn(auth, admin, indEmail, `E2e-${ts}-Ind!Aa`, indMeta)
    createdUserIds.push(ind.userId)

    if (!(await waitForProfile(admin, ind.userId))) fail('individual DB profile missing')

    let { res, json } = await apiFetch('/v1/account/profile', { jwt: ind.jwt })
    if (!res.ok) fail('GET account profile', `${res.status} ${JSON.stringify(json)}`)
    if (!isProfileComplete(json)) fail('individual profile complete', JSON.stringify(json))
    pass('GET account profile (complete)')

    ;({ res, json } = await apiFetch('/v1/operator/context', { jwt: ind.jwt }))
    if (!res.ok) fail('operator context', res.status)
    if (!json.organizationIds?.length) fail('operator context orgs', JSON.stringify(json))
    pass(`operator context (${json.organizationIds.length} org(s))`)

    ;({ res, json } = await apiFetch('/v1/account/profile', {
      method: 'PATCH',
      jwt: ind.jwt,
      body: { job_title: 'Security Engineer' },
    }))
    if (!res.ok) fail('PATCH account profile', `${res.status} ${JSON.stringify(json)}`)
    if (json.job_title !== 'Security Engineer') fail('PATCH job_title', json.job_title)
    pass('PATCH account profile')

    // ─── 2. Organization signup + org profile API ───
    console.log('\n2. Organization account')
    const orgMeta = {
      signup_type: 'organization',
      portal_type: 'operator',
      signup_source: 'dashboard',
      auth_provider: 'email',
      organization_name: 'E2E Acct Corp',
      organization_legal_name: 'E2E Acct Corp',
      organization_website: 'e2e-acct.example',
      organization_country_code: 'US',
      company_size: '11-50',
      industry: 'software',
      primary_contact_name: 'E2E Owner',
      primary_contact_title: 'CEO',
      primary_contact_email: orgEmail,
      display_name: 'E2E Owner',
      terms_accepted_at: new Date().toISOString(),
      terms_version: '2025-05',
    }
    const orgUser = await signUpAndSignIn(auth, admin, orgEmail, `E2e-${ts}-Org!Aa`, orgMeta)
    createdUserIds.push(orgUser.userId)

    ;({ res, json } = await apiFetch('/v1/operator/context', { jwt: orgUser.jwt }))
    const orgId = json.organizationIds?.[0]
    if (!orgId || orgId.startsWith('personal-')) fail('org tenant id', orgId)
    pass(`organization tenant ${orgId}`)

    ;({ res, json } = await apiFetch(`/v1/orgs/${orgId}/profile`, { jwt: orgUser.jwt }))
    if (!res.ok) fail('GET org profile', `${res.status} ${JSON.stringify(json)}`)
    if (json.legal_name !== 'E2E Acct Corp') fail('org legal_name', json.legal_name)
    if (json.is_personal_workspace) fail('org should not be personal workspace')
    pass('GET organization profile')

    ;({ res, json } = await apiFetch(`/v1/orgs/${orgId}/profile`, {
      method: 'PATCH',
      jwt: orgUser.jwt,
      body: { primary_contact_title: 'Chief Technology Officer' },
    }))
    if (!res.ok) fail('PATCH org profile', `${res.status} ${JSON.stringify(json)}`)
    if (json.primary_contact_title !== 'Chief Technology Officer') {
      fail('PATCH primary_contact_title', json.primary_contact_title)
    }
    pass('PATCH organization profile')

    // Audit trail for profile change
    const { data: audits } = await admin
      .from('audit_events')
      .select('action, context')
      .eq('org_id', orgId)
      .eq('action', 'organization.profile.updated')
      .order('created_at', { ascending: false })
      .limit(1)
    if (!audits?.length) {
      console.warn('  ⚠ no organization.profile.updated audit row (non-fatal)')
    } else {
      pass('audit event organization.profile.updated')
    }

    // ─── 3. Profile completion (incomplete OAuth-style user) ───
    console.log('\n3. Profile completion gate')
    const incompleteMeta = {
      signup_type: 'individual',
      portal_type: 'operator',
      auth_provider: 'google',
    }
    const inc = await signUpAndSignIn(auth, admin, incompleteEmail, `E2e-${ts}-Inc!Aa`, incompleteMeta)
    createdUserIds.push(inc.userId)

    ;({ res, json } = await apiFetch('/v1/account/profile', { jwt: inc.jwt }))
    if (!res.ok) fail('incomplete GET profile', res.status)
    if (isProfileComplete(json)) {
      fail('incomplete should be flagged', JSON.stringify(json))
    }
    pass('incomplete profile flagged')

    ;({ res, json } = await apiFetch('/v1/account/profile', {
      method: 'PATCH',
      jwt: inc.jwt,
      body: {
        display_name: 'OAuth Completer',
        country_code: 'CA',
        accept_terms: true,
      },
    }))
    if (!res.ok) fail('complete profile PATCH', `${res.status} ${JSON.stringify(json)}`)
    if (!isProfileComplete(json)) fail('profile still incomplete', JSON.stringify(json))
    pass('profile completion via PATCH')

    if (hasDomainsApi) {
      // ─── 4. SSO domains (Team plan + DNS add; verify expects failure without DNS) ───
      console.log('\n4. Company SSO domains')
      await admin.from('org_plans').upsert({ org_id: orgId, plan_id: 'team' }, { onConflict: 'org_id' })

      ;({ res, json } = await apiFetch(`/v1/orgs/${orgId}/domains`, { jwt: orgUser.jwt }))
      if (!res.ok) fail('GET domains', `${res.status} ${JSON.stringify(json)}`)
      pass('GET domains (team plan)')

      ;({ res, json } = await apiFetch(`/v1/orgs/${orgId}/domains`, {
        method: 'POST',
        jwt: orgUser.jwt,
        body: { domain: testDomain },
      }))
      if (!res.ok) fail('POST domain', `${res.status} ${JSON.stringify(json)}`)
      if (!json.dns_txt_value?.includes('sanctum-domain-verification=')) {
        fail('domain DNS token missing', json.dns_txt_value)
      }
      pass(`domain registered ${testDomain} with TXT token`)

      ;({ res, json } = await apiFetch(`/v1/orgs/${orgId}/domains/${encodeURIComponent(testDomain)}/verify`, {
        method: 'POST',
        jwt: orgUser.jwt,
      }))
      if (res.status !== 422) {
        fail('verify without DNS', `expected 422, got ${res.status} ${JSON.stringify(json)}`)
      }
      pass('domain verify correctly rejects missing DNS (422)')

      ;({ res } = await apiFetch(`/v1/orgs/${orgId}/domains/${encodeURIComponent(testDomain)}`, {
        method: 'DELETE',
        jwt: orgUser.jwt,
      }))
      if (!res.ok) fail('DELETE domain', res.status)
      pass('domain removed')
    }

    // ─── 5. Enterprise SSO domain join ───
    console.log('\n5. Enterprise SSO domain join')
    const ssoDomain = `sso-${ts}.example`
    await admin.from('organization_domains').upsert({
      domain: ssoDomain,
      org_id: orgId,
      verified: true,
      verified_at: new Date().toISOString(),
      verification_method: 'manual',
    })
    const ssoEmail = `user@${ssoDomain}`
    const ssoUser = await signUpAndSignIn(auth, admin, ssoEmail, `E2e-${ts}-Sso!Aa`, {
      signup_type: 'individual',
      portal_type: 'enterprise',
      auth_provider: 'google',
    })
    createdUserIds.push(ssoUser.userId)

    const { data: bootOrg, error: bootErr } = await auth.auth.signInWithPassword({
      email: ssoEmail,
      password: `E2e-${ts}-Sso!Aa`,
    })
    if (bootErr) fail('sso signIn', bootErr.message)
    const ssoJwt = bootOrg.session?.access_token
    const sbUser = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${ssoJwt}` } },
    })
    const { data: joinedOrgId, error: rpcErr } = await sbUser.rpc('bootstrap_enterprise_org_for_user')
    if (rpcErr) fail('bootstrap_enterprise_org_for_user', rpcErr.message)
    if (joinedOrgId !== orgId) fail('SSO join org', `${joinedOrgId} !== ${orgId}`)

    const { data: ssoMems } = await admin
      .from('organization_members')
      .select('org_id')
      .eq('user_id', ssoUser.userId)
      .eq('org_id', orgId)
    if (!ssoMems?.length) fail('SSO membership missing')
    pass(`enterprise user joined org via @${ssoDomain}`)

    await admin.from('organization_domains').delete().eq('domain', ssoDomain)

    console.log('\n✅ All accounts E2E checks passed.\n')
  } finally {
    try {
      await admin.from('organization_domains').delete().eq('domain', testDomain)
    } catch {
      /* ignore */
    }
    for (const id of createdUserIds) {
      try {
        await admin.auth.admin.deleteUser(id)
      } catch {
        /* ignore */
      }
    }
    pass(`cleaned up ${createdUserIds.length} test users`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
