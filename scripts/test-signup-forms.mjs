#!/usr/bin/env node
/**
 * E2E: signup metadata → Supabase triggers → profiles + organizations.
 *
 * Usage: node scripts/test-signup-forms.mjs
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.e2e.local'), override: true })

const pass = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg, detail) => {
  console.error(`  ✗ ${msg}`, detail ?? '')
  process.exit(1)
}

const ts = Date.now()
const individualEmail = `signup-ind-${ts}@sanctum-e2e.test`
const orgEmail = `signup-org-${ts}@sanctum-e2e.test`

const individualMeta = {
  signup_type: 'individual',
  portal_type: 'operator',
  signup_source: 'dashboard',
  auth_provider: 'email',
  display_name: 'E2E Individual',
  full_name: 'E2E Individual',
  country_code: 'US',
  terms_accepted_at: new Date().toISOString(),
  terms_version: '2025-05',
}

const organizationMeta = {
  signup_type: 'organization',
  portal_type: 'operator',
  signup_source: 'dashboard',
  auth_provider: 'email',
  organization_name: 'E2E Test Corp',
  organization_legal_name: 'E2E Test Corp',
  organization_website: 'e2etest.example',
  organization_country_code: 'US',
  company_size: '11-50',
  industry: 'software',
  primary_contact_name: 'E2E Owner',
  primary_contact_title: 'CTO',
  primary_contact_email: orgEmail,
  display_name: 'E2E Owner',
  terms_accepted_at: new Date().toISOString(),
  terms_version: '2025-05',
}

const oauthOperatorMeta = {
  signup_type: 'individual',
  portal_type: 'operator',
  signup_source: 'dashboard',
  auth_provider: 'google',
}

async function waitForProfile(admin, userId, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await admin
      .from('profiles')
      .select(
        'display_name, portal_type, country_code, accepted_terms_at, terms_version, job_title, auth_provider',
      )
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    if (data) return data
    await new Promise((r) => setTimeout(r, 250 * (i + 1)))
  }
  return null
}

async function signUpLikeForm(admin, anonKey, email, password, metadata) {
  const url = process.env.SUPABASE_URL?.trim()
  if (process.env.SANCTUM_E2E_USE_PUBLIC_SIGNUP !== 'true') {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) fail(`createUser ${email}`, error.message)
    if (!data.user?.id) fail(`createUser ${email}`, 'no user id')
    return data.user.id
  }

  const auth = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await auth.auth.signUp({
    email,
    password,
    options: { data: metadata },
  })
  if (error) fail(`signUp ${email}`, error.message)
  if (!data.user?.id) fail(`signUp ${email}`, 'no user id')
  return data.user.id
}

async function main() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey =
    process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !serviceKey || !anonKey) {
    fail('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const createdUserIds = []

  console.log('\nSignup forms E2E (Supabase triggers)\n')

  try {
    // Individual email signup (same path as dashboard form)
    const indUserId = await signUpLikeForm(
      admin,
      anonKey,
      individualEmail,
      `E2e-${ts}-Ind!Aa`,
      individualMeta,
    )
    createdUserIds.push(indUserId)

    const indProfile = await waitForProfile(admin, indUserId)
    if (!indProfile) fail('individual profile', 'trigger did not create profile row')
    if (indProfile.portal_type !== 'operator') fail('individual portal_type', indProfile.portal_type)
    if (indProfile.country_code !== 'US') fail('individual country_code', indProfile.country_code)
    if (!indProfile.accepted_terms_at) fail('individual accepted_terms_at missing')
    if (indProfile.terms_version !== '2025-05') fail('individual terms_version', indProfile.terms_version)
    pass('individual profile + compliance fields')

    const { data: indMems, error: indMemErr } = await admin
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', indUserId)
    if (indMemErr) fail('individual memberships', indMemErr.message)
    const personalOrg = indMems?.find((m) => m.org_id.startsWith('personal-'))
    if (!personalOrg || personalOrg.role !== 'owner') fail('individual personal org missing')
    pass(`individual personal org ${personalOrg.org_id}`)

    const { data: indPlan } = await admin
      .from('org_plans')
      .select('plan_id')
      .eq('org_id', personalOrg.org_id)
      .maybeSingle()
    if (indPlan?.plan_id !== 'observer') fail('individual plan', indPlan?.plan_id)
    pass('individual org on observer plan')

    // Organization email signup (form metadata)
    const orgUserId = await signUpLikeForm(
      admin,
      anonKey,
      orgEmail,
      `E2e-${ts}-Org!Aa`,
      organizationMeta,
    )
    createdUserIds.push(orgUserId)

    const orgProfile = await waitForProfile(admin, orgUserId)
    if (!orgProfile) fail('organization profile', 'trigger did not create profile row')
    if (orgProfile.portal_type !== 'operator') fail('organization portal_type', orgProfile.portal_type)
    if (orgProfile.job_title !== 'CTO') fail('organization job_title', orgProfile.job_title)
    pass('organization owner profile')

    const { data: orgMems, error: orgMemErr } = await admin
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', orgUserId)
    if (orgMemErr) fail('organization memberships', orgMemErr.message)
    const owned = orgMems?.filter((m) => m.role === 'owner') ?? []
    if (owned.length !== 1) fail('organization owner membership count', owned.length)
    const orgId = owned[0].org_id
    const personalLeak = orgMems?.some((m) => m.org_id.startsWith('personal-'))
    if (personalLeak) fail('organization signup must not create personal workspace', orgMems)

    const { data: orgPlan } = await admin
      .from('org_plans')
      .select('plan_id')
      .eq('org_id', orgId)
      .maybeSingle()
    if (orgPlan?.plan_id !== 'observer') fail('organization plan', orgPlan?.plan_id)
    pass('organization org on observer (Developer) plan')

    const { data: orgRow, error: orgRowErr } = await admin
      .from('organizations')
      .select(
        'name, legal_name, website, country_code, company_size, industry, primary_contact_name, primary_contact_email, primary_contact_title, signup_source',
      )
      .eq('id', orgId)
      .single()
    if (orgRowErr) fail('organization row', orgRowErr.message)
    if (orgRow.legal_name !== 'E2E Test Corp') fail('organization legal_name', orgRow.legal_name)
    if (orgRow.website !== 'e2etest.example') fail('organization website', orgRow.website)
    if (orgRow.company_size !== '11-50') fail('organization company_size', orgRow.company_size)
    if (orgRow.industry !== 'software') fail('organization industry', orgRow.industry)
    if (orgRow.primary_contact_email !== orgEmail) fail('organization primary_contact_email')
    if (orgRow.signup_source !== 'dashboard') fail('organization signup_source', orgRow.signup_source)
    pass(`organization tenant ${orgId} with compliance columns`)

    // OAuth operator metadata shape (no provider round-trip)
    const oauthEmail = `signup-oauth-${ts}@sanctum-e2e.test`
    const oauthUserId = await signUpLikeForm(
      admin,
      anonKey,
      oauthEmail,
      `E2e-${ts}-Oauth!Aa`,
      oauthOperatorMeta,
    )
    createdUserIds.push(oauthUserId)

    const oauthProfile = await waitForProfile(admin, oauthUserId)
    if (oauthProfile?.portal_type !== 'operator') fail('oauth portal_type', oauthProfile?.portal_type)
    if (oauthProfile?.auth_provider !== 'google') fail('oauth auth_provider', oauthProfile?.auth_provider)
    pass('operator OAuth metadata → profile')

    console.log('\nAll signup form paths passed.\n')
  } finally {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {})
    }
    pass(`cleaned up ${createdUserIds.length} test users`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
